import { types } from "@nexusmods/vortex-api";

import { ISignInPurpose } from "./types/interface";
import { ISteamJob } from "./util/steamJob";

const DOWNLOADING = { message: "Downloading from Steam servers" };

function steamJob(
  id: string,
  title: string,
  signIn: ISignInPurpose,
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
    signIn,
  };
}

export const VERIFY_FILES_JOB = steamJob(
  "steamkit_verifying_files",
  "Verifying game files...",
  {
    title: "Verify Integrity of Steam Game Files",
    text:
      "Steam checks that the game's files are installed correctly, and restores the original files you " +
      "select. It can't fix conflicts between mods.",
  },
  { title: "Restoring Steam game files...", message: "Downloading files from Steam servers" },
);

export const workshopDownloadJob = (publishedFileId: string) =>
  steamJob("steamkit_downloading_mod", `Downloading ${publishedFileId}`, {
    title: "Sign in to Steam",
    text: "Steam only provides this Workshop item to an account that owns the game.",
  });

export const installVersionJob = (versionLabel: string) =>
  steamJob("steamkit_installing_version", `Installing ${versionLabel}`, {
    title: "Sign in to Steam",
    text: `Steam only provides the files of ${versionLabel} to an account that owns the game.`,
  });

export const VERIFY_FAILED = "File integrity checks failed";
export const WORKSHOP_DOWNLOAD_FAILED = "Failed to download mod";
export const INSTALL_VERSION_FAILED = "Failed to install the game version";
