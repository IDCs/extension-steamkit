// This file is subject to the terms and conditions defined
// in file 'LICENSE', which is part of this source code package.

using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using ProtoBuf;
using SteamKit2;

namespace DepotDownloader
{
    /// <summary>Which version of an app is installed, from Steam's and steamkit's records of the install.</summary>
    static class InstalledVersion
    {
        /// <summary>
        /// Each installed depot and the manifest it is at: Steam's, overlaid with steamkit's where steamkit wrote
        /// its record after Steam last updated the app. Empty when neither records the install.
        /// </summary>
        public static List<(uint depotId, ulong manifestId)> ToVerify(string installDirectory, uint appId)
        {
            var steam = SteamRecord(installDirectory, appId);
            var manifests = steam?.manifests ?? [];

            var record = Path.Combine(installDirectory, ContentDownloader.CONFIG_DIR, "depot.config");
            var recordIsNewer = steam is not { } installed || File.GetLastWriteTimeUtc(record) > installed.lastUpdated;
            if (File.Exists(record) && recordIsNewer)
            {
                foreach (var (depotId, manifestId) in SteamkitRecord(record))
                {
                    manifests[depotId] = manifestId;
                }
            }

            return manifests.Select(entry => (entry.Key, entry.Value)).ToList();
        }

        /// <summary>Reads as DepotConfigStore.LoadFromFile does, without replacing the store a download uses.</summary>
        static Dictionary<uint, ulong> SteamkitRecord(string record)
        {
            using var file = File.OpenRead(record);
            using var inflated = new DeflateStream(file, CompressionMode.Decompress);
            return Serializer.Deserialize<DepotConfigStore>(inflated).InstalledManifestIDs
                .Where(entry => entry.Value != ContentDownloader.INVALID_MANIFEST_ID)
                .ToDictionary();
        }

        /// <summary>
        /// When Steam last updated the app, and the manifest of each depot it installed, from the appmanifest in
        /// the app's library. Shared depots, such as redistributables, install elsewhere and are left out.
        /// </summary>
        static (DateTime lastUpdated, Dictionary<uint, ulong> manifests)? SteamRecord(string installDirectory, uint appId)
        {
            // <library>/steamapps/common/<app> has its appmanifest at <library>/steamapps/appmanifest_<appId>.acf
            var appManifest = Path.GetFullPath(Path.Combine(installDirectory, "..", "..", $"appmanifest_{appId}.acf"));
            var appState = KeyValue.LoadAsText(appManifest);
            if (appState == null)
            {
                return null;
            }

            var manifests = appState["InstalledDepots"].Children
                .Where(depot => uint.TryParse(depot.Name, out _))
                .ToDictionary(depot => uint.Parse(depot.Name), depot => depot["manifest"].AsUnsignedLong());
            return (DateTimeOffset.FromUnixTimeSeconds(appState["LastUpdated"].AsLong()).UtcDateTime, manifests);
        }
    }
}
