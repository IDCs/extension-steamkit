import { types } from "@nexusmods/vortex-api";

import { ISteamJob } from "./util/steamJob";

const DOWNLOADING = { message: "Downloading from Steam servers" };

function steamJob(
  id: string,
  title: string,
  progress: Partial<types.INotification> = DOWNLOADING,
): ISteamJob {
  return {
    notification: {
      id,
      type: "activity",
      title,
      message: "Connecting to Steam servers",
      noDismiss: true,
      allowSuppress: false,
    },
    progress,
  };
}

export const VERIFY_FILES_JOB = steamJob("steamkit_verifying_files", "Verifying game files...", {
  title: "Restoring Steam game files...",
  message: "Downloading files from Steam servers",
});

export const workshopDownloadJob = (publishedFileId: string) =>
  steamJob("steamkit_downloading_mod", `Downloading ${publishedFileId}`);

export const installVersionJob = (versionLabel: string) =>
  steamJob("steamkit_installing_version", `Installing ${versionLabel}`);

export const VERIFY_FAILED = "File integrity checks failed";
export const WORKSHOP_DOWNLOAD_FAILED = "Failed to download mod";
export const INSTALL_VERSION_FAILED = "Failed to install the game version";
