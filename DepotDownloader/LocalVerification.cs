// This file is subject to the terms and conditions defined
// in file 'LICENSE', which is part of this source code package.

using System;
using System.Buffers;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Threading;
using SteamKit2;

namespace DepotDownloader
{
    /// <summary>Collects the installed files that differ from their depot's manifest, across a run's depots.</summary>
    sealed class LocalVerification(CancellationToken cancellation = default)
    {
        // Each depot the run checks, in the order the download installs them.
        readonly List<(string installDirectory, List<DepotManifest.FileData> files)> depots = [];

        public void Check(string installDirectory, IEnumerable<DepotManifest.FileData> manifestFiles)
        {
            depots.Add((installDirectory, manifestFiles.ToList()));
        }

        /// <summary>
        /// The files that differ across every depot checked. A file several depots install to the same path is
        /// checked against the last of them, the copy the download installs (as ContentDownloader.DownloadSteam3Async).
        /// </summary>
        public List<DepotManifest.FileData> FindMismatches()
        {
            var lastDepotByPath = new Dictionary<string, int>();
            for (var depotIndex = 0; depotIndex < depots.Count; depotIndex++)
            {
                foreach (var file in depots[depotIndex].files)
                {
                    lastDepotByPath[Path.Combine(depots[depotIndex].installDirectory, file.FileName)] = depotIndex;
                }
            }

            var entries = depots.SelectMany((depot, depotIndex) => ToCheck(
                depot.installDirectory,
                depot.files.Where(file => lastDepotByPath[Path.Combine(depot.installDirectory, file.FileName)] == depotIndex)));
            return Hash(entries.ToArray(), cancellation);
        }

        /// <summary>
        /// Manifest files in the run's file list that are missing or differ from the manifest, in manifest order.
        /// A depot none of whose files are installed is left alone, as are installed files the manifest doesn't list.
        /// </summary>
        public static List<DepotManifest.FileData> FindMismatches(
            string installDirectory, IEnumerable<DepotManifest.FileData> manifestFiles, CancellationToken cancellation = default)
        {
            return Hash(ToCheck(installDirectory, manifestFiles).ToArray(), cancellation);
        }

        static IEnumerable<(DepotManifest.FileData file, string path)> ToCheck(
            string installDirectory, IEnumerable<DepotManifest.FileData> manifestFiles)
        {
            var files = manifestFiles
                .Where(file => !file.Flags.HasFlag(EDepotFileFlag.Directory))
                .Select(file => (file, path: Path.Combine(installDirectory, file.FileName)))
                .ToArray();

            // Steam installs shared redistributables elsewhere, and leaves out DLC the user turned off.
            return files.Any(entry => File.Exists(entry.path))
                ? files.Where(entry => ContentDownloader.TestIsFileIncluded(entry.file.FileName))
                : [];
        }

        static List<DepotManifest.FileData> Hash(
            (DepotManifest.FileData file, string path)[] entries, CancellationToken cancellation)
        {
            // Load-balanced, so one worker doesn't end up with every large archive.
            return Partitioner.Create(entries, loadBalance: true)
                .AsParallel()
                .AsOrdered()
                .WithDegreeOfParallelism(MaxParallelHashes)
                .WithCancellation(cancellation)
                .Where(entry => !Matches(entry.path, entry.file, cancellation))
                .Select(entry => entry.file)
                .ToList();
        }

        // Hashing is disk-bound, so a few files at a time is enough to keep the disk busy.
        const int MaxParallelHashes = 4;

        const int HashReadSize = 1 << 20;

        /// <summary>
        /// Whether the file is installed as the manifest's. Cancelling stops between reads, not at the end of the file.
        /// </summary>
        internal static bool Matches(string path, DepotManifest.FileData file, CancellationToken cancellation = default)
        {
            // A missing file or a different size settles it without reading the file.
            var installed = new FileInfo(path);
            if (!installed.Exists || installed.Length != (long)file.TotalSize)
            {
                return false;
            }

            using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, HashReadSize, FileOptions.SequentialScan);
            using var sha1 = IncrementalHash.CreateHash(HashAlgorithmName.SHA1);
            var buffer = ArrayPool<byte>.Shared.Rent(HashReadSize);
            try
            {
                int read;
                while ((read = stream.Read(buffer, 0, HashReadSize)) > 0)
                {
                    cancellation.ThrowIfCancellationRequested();
                    sha1.AppendData(buffer, 0, read);
                }
            }
            finally
            {
                ArrayPool<byte>.Shared.Return(buffer);
            }
            return sha1.GetHashAndReset().AsSpan().SequenceEqual(file.FileHash);
        }
    }
}
