// This file is subject to the terms and conditions defined
// in file 'LICENSE', which is part of this source code package.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Common;

namespace DepotDownloader
{
    /// <summary>The app is not available to the signed-in account.</summary>
    class ContentDownloaderAccountException(string value) : ContentDownloaderException(value);

    /// <summary>Runs one verification or download for a host that answers the downloader's questions.</summary>
    public static class Exec
    {
        /// <summary>The host of the current run.</summary>
        internal static HostCallbacks Host { get; private set; }

        /// <summary>Answers Steam's sign-in challenges for the current run.</summary>
        internal static HostAuthenticator Authenticator { get; private set; }

        /// <summary>Checks the installed files of each depot, while the current run verifies.</summary>
        internal static LocalVerification Verification { get; private set; }

        /// <summary>Passes the current run's download progress to the host.</summary>
        internal static ProgressReporter Progress { get; private set; }

        /// <summary>Stops the current run when the host cancels it.</summary>
        internal static CancellationToken Cancellation { get; private set; }

        /// <summary>Starts a run that calls back into the given host.</summary>
        internal static void BeginRun(HostCallbacks host, bool verifying = false, CancellationToken cancellation = default)
        {
            Host = host;
            Authenticator = new HostAuthenticator(host, cancellation);
            Progress = new ProgressReporter(host.ReportProgress);
            Cancellation = cancellation;
            Verification = verifying ? new LocalVerification(cancellation) : null;
            ContentDownloader.Config = new DownloadConfig
            {
                FilesToDownload = new HashSet<string>(StringComparer.OrdinalIgnoreCase),
                FilesToDownloadRegex = [],
            };
        }

        /// <summary>Lets go of the run's host, so its callbacks can be collected.</summary>
        internal static void EndRun()
        {
            Host = null;
            Authenticator = null;
            Progress = null;
            Verification = null;
            Cancellation = CancellationToken.None;
            SignedInAnonymously = false;
        }

        /// <summary>Each download loads the depot config of its install directory afresh.</summary>
        internal static void PrepareDownload()
        {
            DepotConfigStore.Instance = null;
        }

        /// <summary>Restricts the run to the given files. Entries prefixed "regex:" are patterns.</summary>
        internal static void ApplyFileList(IEnumerable<string> fileEntries)
        {
            ContentDownloader.Config.UsingFileList = true;
            ContentDownloader.Config.FilesToDownload = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            ContentDownloader.Config.FilesToDownloadRegex = [];

            foreach (var fileEntry in fileEntries)
            {
                if (fileEntry.StartsWith(RegexPrefix))
                {
                    var rgx = new Regex(fileEntry[RegexPrefix.Length..], RegexOptions.Compiled | RegexOptions.IgnoreCase);
                    ContentDownloader.Config.FilesToDownloadRegex.Add(rgx);
                }
                else
                {
                    ContentDownloader.Config.FilesToDownload.Add(fileEntry.Replace('\\', '/'));
                }
            }

            Console.WriteLine("Using filelist: {0} entries.", ContentDownloader.Config.FilesToDownload.Count + ContentDownloader.Config.FilesToDownloadRegex.Count);
        }

        const string RegexPrefix = "regex:";

        /// <summary>A file list's lines, with absolute paths made relative to the install directory.</summary>
        internal static string[] FileListEntries(string fileList, string installDirectory)
        {
            return fileList
                .Split(['\n', '\r'], StringSplitOptions.RemoveEmptyEntries)
                .Select(entry => !entry.StartsWith(RegexPrefix) && Path.IsPathRooted(entry) ? Path.GetRelativePath(installDirectory, entry) : entry)
                .ToArray();
        }

        /// <summary>
        /// Verifies a Steam app's installed files, or downloads a workshop item when PubFile is set. Starts
        /// anonymously and asks the host to sign in if the app needs an account.
        /// </summary>
        public static async Task Run(RunParameters parameters, HostCallbacks host, CancellationToken cancellation = default)
        {
            BeginRun(host, verifying: parameters.ManifestOnly, cancellation);

            try
            {
                var username = UseRememberedAccount(parameters);
                ContentDownloader.Config.CellID = parameters.CellId;
                ContentDownloader.Config.InstallDirectory = parameters.InstallDirectory;
                ContentDownloader.Config.VerifyAll = parameters.VerifyAll;
                ContentDownloader.Config.MaxDownloads = parameters.MaxDownloads;
                ContentDownloader.Config.LoginID = parameters.LoginId == 0 ? null : parameters.LoginId;
                ContentDownloader.Config.BetaPassword = parameters.BetaBranchPassword;

                if (parameters.FileList != null)
                {
                    ApplyFileList(FileListEntries(parameters.FileList, parameters.InstallDirectory));
                }

                if (string.IsNullOrEmpty(parameters.AppId))
                {
                    throw new ContentDownloaderException("No Steam app id was given");
                }

                var appId = uint.Parse(parameters.AppId);
                var depots = DepotsToRun(parameters, appId);

                async Task SignInAndDownload()
                {
                    var credentials = await host.RequestCredentials(Cancellation);
                    if (credentials.Cancelled)
                    {
                        throw new SignInCancelledException();
                    }

                    ContentDownloader.Config.UseQrCode = credentials.UseQrCode;
                    ContentDownloader.Config.RememberPassword = credentials.Remember;
                    await DownloadAsync(parameters, depots, appId, credentials.Username, credentials.Password);
                }

                try
                {
                    await DownloadAsync(parameters, depots, appId, username, parameters.Password);
                }
                catch (ContentDownloaderAccountException) when (username == null)
                {
                    await SignInAndDownload();
                }
                catch (SignInFailedException) when (parameters.LoginToken != null)
                {
                    // Steam rejected the remembered token: it expired or the user revoked it.
                    await host.ForgetLoginToken(username);
                    await SignInAndDownload();
                }
            }
            finally
            {
                await Progress.CompleteAsync();
                EndRun();
            }
        }

        /// <summary>
        /// Fails a download Steam provided none of the depots for, or not every depot the caller asked for.
        /// Discovered depots the account can't use, such as DLC it doesn't own, are left out.
        /// </summary>
        internal static void RequireResolvedDepots(
            uint appId, IEnumerable<uint> depotIds, IEnumerable<uint> resolvedDepotIds, bool requestedDepots, bool anonymous)
        {
            var missing = depotIds.Except(resolvedDepotIds).ToList();
            var noneResolved = !resolvedDepotIds.Any();
            if (!noneResolved && !(requestedDepots && missing.Count > 0))
            {
                return;
            }

            // Steam lists an owned game's app info anonymously, but keeps its depots to accounts that own it.
            if (anonymous)
            {
                throw new ContentDownloaderAccountException($"App {appId}'s depots are only available to an account that owns it.");
            }

            throw new ContentDownloaderException(noneResolved
                ? $"Steam provided none of app {appId}'s depots; the Vortex log says why"
                : $"Steam did not provide depot {string.Join(", ", missing)} of app {appId}; the Vortex log says why");
        }

        /// <summary>Whether the current run is signed in to Steam without an account.</summary>
        internal static bool SignedInAnonymously { get; private set; }

        /// <summary>
        /// The depots and manifests a run covers: the ones given; when verifying without any, the installed
        /// version; otherwise none, for every depot of the app at Steam's latest.
        /// </summary>
        static List<(uint depotId, ulong manifestId)> DepotsToRun(RunParameters parameters, uint appId)
        {
            var given = DepotManifestIds(parameters);
            if (given.Count > 0 || !parameters.ManifestOnly || parameters.InstallDirectory == null)
            {
                return given;
            }

            var installed = InstalledVersion.ToVerify(parameters.InstallDirectory, appId);
            if (installed.Count > 0)
            {
                Console.WriteLine("Verifying the installed version: {0}",
                    string.Join(", ", installed.Select(entry => $"depot {entry.depotId} manifest {entry.manifestId}")));
            }
            return installed;
        }

        /// <summary>Starts the run's in-memory account store from the account the host remembers.</summary>
        /// <returns>Who to sign in as: the caller's username, else the remembered account when it has a token.</returns>
        internal static string UseRememberedAccount(RunParameters parameters)
        {
            AccountSettingsStore.UseInMemory(formerFileName: "account.config");
            var account = parameters.Account;
            if (account != null)
            {
                if (parameters.LoginToken != null)
                {
                    AccountSettingsStore.Instance.LoginTokens[account] = parameters.LoginToken;
                }

                if (parameters.GuardData != null)
                {
                    AccountSettingsStore.Instance.GuardData[account] = parameters.GuardData;
                }
            }

            // A remembered token is only used, and a new one only handed back, with RememberPassword set.
            ContentDownloader.Config.RememberPassword = parameters.RememberPassword || parameters.LoginToken != null;
            return parameters.Username ?? (parameters.LoginToken != null ? account : null);
        }

        /// <summary>Records a sign-in Steam accepted, and hands it to the host to keep.</summary>
        internal static void SignedIn(string accountName, string refreshToken, string newGuardData)
        {
            var remember = ContentDownloader.Config.RememberPassword;
            RecordSignIn(AccountSettingsStore.Instance, accountName, refreshToken, newGuardData, remember);
            Host.RecordSignIn(accountName, remember ? refreshToken : null, newGuardData).ContinueWith(
                failed => Console.WriteLine("The sign-in could not be kept: {0}", failed.Exception?.GetBaseException().Message),
                TaskContinuationOptions.OnlyOnFaulted);
        }

        /// <summary>An account name as logged: its first letter.</summary>
        internal static string Anonymise(string accountName) =>
            string.IsNullOrEmpty(accountName) ? accountName : accountName[0] + "***";

        /// <summary>
        /// Records a sign-in in the account store: Steam Guard's record that this machine passed it, and the
        /// sign-in token only when the user asked to be remembered.
        /// </summary>
        internal static void RecordSignIn(
            AccountSettingsStore account, string accountName, string refreshToken, string newGuardData, bool rememberPassword)
        {
            if (newGuardData != null)
            {
                account.GuardData[accountName] = newGuardData;
            }
            else
            {
                account.GuardData.Remove(accountName);
            }

            if (rememberPassword)
            {
                account.LoginTokens[accountName] = refreshToken;
            }
            else
            {
                account.LoginTokens.Remove(accountName);
            }
        }

        /// <summary>Why signing in to Steam ended without a session.</summary>
        internal static Exception SignInFailure() => SignInFailure(ContentDownloader.CouldNotConnect);

        internal static Exception SignInFailure(bool couldNotConnect)
        {
            if (Authenticator.SignInCancelled)
            {
                return new SignInCancelledException();
            }

            return couldNotConnect
                ? new SteamUnreachableException("Could not connect to Steam")
                : new SignInFailedException("Unable to sign in to Steam");
        }

        /// <summary>
        /// Asks the host once which of the files that differ to restore, and limits the next download to them.
        /// </summary>
        /// <returns>Whether there is anything to restore.</returns>
        internal static async Task<bool> SelectFilesToRestoreAsync()
        {
            var mismatches = Verification.FindMismatches();
            if (mismatches.Count == 0)
            {
                Console.WriteLine("All installed files match the manifest.");
                return false;
            }

            var fileNames = mismatches.Select(file => file.FileName).ToArray();
            Console.WriteLine("{0} installed files differ from the manifest, including: {1}",
                fileNames.Length, string.Join(", ", fileNames.Take(20)));
            var selected = await Host.ReportMismatch(fileNames, Cancellation);
            if (selected.Length == 0)
            {
                return false;
            }

            Verification = null;
            ApplyFileList(selected);
            return true;
        }

        static async Task DownloadAsync(
            RunParameters parameters, List<(uint depotId, ulong manifestId)> depots, uint appId, string username, string password)
        {
            SignedInAnonymously = username == null && !ContentDownloader.Config.UseQrCode;
            if (SignedInAnonymously)
            {
                Console.WriteLine("No username given. Using anonymous account with dedicated server subscription.");
            }

            try
            {
                if (!ContentDownloader.InitializeSteam3(username, password))
                {
                    throw SignInFailure();
                }

                Cancellation.ThrowIfCancellationRequested();
                if (parameters.PubFile != ContentDownloader.INVALID_MANIFEST_ID)
                {
                    PrepareDownload();
                    await ContentDownloader.DownloadPubfileAsync(appId, parameters.PubFile).ConfigureAwait(false);
                }
                else
                {
                    await DownloadAppAsync(appId, depots, parameters.Branch);

                    // Verifying checks every depot first, then downloads the files the user selects.
                    if (Verification != null && await SelectFilesToRestoreAsync())
                    {
                        Cancellation.ThrowIfCancellationRequested();
                        await DownloadAppAsync(appId, depots, parameters.Branch);
                    }
                }
            }
            finally
            {
                ContentDownloader.ShutdownSteam3();
            }
        }

        static Task DownloadAppAsync(uint appId, List<(uint depotId, ulong manifestId)> depots, string branch)
        {
            PrepareDownload();
            return ContentDownloader.DownloadAppAsync(
                appId, depots, branch ?? ContentDownloader.DEFAULT_BRANCH, null, null, null, false, false);
        }

        internal static List<(uint, ulong)> DepotManifestIds(RunParameters parameters)
        {
            var depotIds = parameters.DepotIdList ?? [];
            var manifestIds = parameters.ManifestIdList ?? [];

            if (manifestIds.Count == 0)
            {
                return depotIds.Select(depotId => (depotId, ContentDownloader.INVALID_MANIFEST_ID)).ToList();
            }

            if (depotIds.Count != manifestIds.Count)
            {
                throw new ContentDownloaderException("Every depot needs a manifest id when manifest ids are given");
            }

            return depotIds.Zip(manifestIds.Select(ulong.Parse)).ToList();
        }
    }
}
