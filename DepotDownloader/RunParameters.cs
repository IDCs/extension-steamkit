// This file is subject to the terms and conditions defined
// in file 'LICENSE', which is part of this source code package.

using System.Collections.Generic;

namespace DepotDownloader
{
    /// <summary>What a run verifies or downloads. The host sets them directly; unset ones keep the defaults.</summary>
    public class RunParameters
    {
        public string Username { get; set; }
        public string Password { get; set; }
        /// <summary>Keep the sign-in: the host is handed the account's sign-in token after signing in.</summary>
        public bool RememberPassword { get; set; }
        /// <summary>The account the host remembers signing in as.</summary>
        public string Account { get; set; }
        /// <summary>The remembered account's sign-in token; with one, the run signs in without asking.</summary>
        public string LoginToken { get; set; }
        /// <summary>Steam Guard's record that this machine passed it, for the remembered account.</summary>
        public string GuardData { get; set; }
        /// <summary>Verifies the installed files, without downloading the app.</summary>
        public bool ManifestOnly { get; set; }
        public int CellId { get; set; }
        /// <summary>Files to verify or download, one per line, relative to the install directory or absolute.</summary>
        public string FileList { get; set; }
        public string InstallDirectory { get; set; }
        public bool VerifyAll { get; set; }
        public int MaxDownloads { get; set; } = 8;
        public uint LoginId { get; set; }
        /// <summary>Steam app id, as a string.</summary>
        public string AppId { get; set; }
        public ulong PubFile { get; set; } = ContentDownloader.INVALID_MANIFEST_ID;
        public string Branch { get; set; }
        public string BetaBranchPassword { get; set; }
        public List<uint> DepotIdList { get; set; }
        /// <summary>The manifest of each depot in DepotIdList, as strings so 64-bit ids survive JavaScript.</summary>
        public List<string> ManifestIdList { get; set; }
    }
}
