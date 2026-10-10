import { actions, selectors, types } from "@nexusmods/vortex-api";

import { INSTALL_VERSION_FAILED, installVersionJob } from "../jobs";
import { runDownloader } from "../native";
import { builtInCatalog, steamAppIdFor, userVersions } from "../selectors";
import { ErrorKind, SteamkitError } from "../types/errors";
import { reportError } from "../util/errors";
import { verifyIsSteamGame, withModsPurged } from "../util/steamGame";
import { runSteamJob } from "../util/steamJob";
import { listGameVersions } from "./catalog";
import { versionRunParameters } from "./install";
import { IListedVersion } from "./types";

/** A game's versions: the built-in ones first, then the user's own. */
export function gameVersions(api: types.IExtensionApi, gameId: string): IListedVersion[] {
  const state = api.getState();
  return listGameVersions(builtInCatalog(state), userVersions(state), gameId);
}

function findGameVersion(api: types.IExtensionApi, gameId: string, versionId: string): IListedVersion {
  const listed = gameVersions(api, gameId).find((entry) => entry.version.id === versionId);
  if (listed === undefined) {
    throw new SteamkitError(ErrorKind.InvalidInput, `${gameId} has no version ${versionId}`);
  }
  return listed;
}

/** Puts the game at a version: Steam downloads that version's depots into the game folder. */
export async function installGameVersion(
  api: types.IExtensionApi,
  gameId: string,
  versionId: string,
): Promise<void> {
  const { version } = findGameVersion(api, gameId, versionId);
  await runSteamJob(api, installVersionJob(version.label), async (ui, signal) => {
    const state = api.getState();
    const discovery = selectors.discoveryByGame(state, gameId);
    const steamAppId = steamAppIdFor(state, gameId);
    await verifyIsSteamGame(steamAppId, discovery);
    await withModsPurged(api, gameId, signal, () =>
      runDownloader(versionRunParameters(steamAppId, discovery.path, version), ui, signal),
    );
  });
  api.sendNotification({
    type: "success",
    title: "Game version installed",
    message: version.label,
    displayMS: 3000,
  });
}

/** Asks the user to confirm, then puts the game at the version. */
export async function confirmAndInstallGameVersion(
  api: types.IExtensionApi,
  gameId: string,
  versionId: string,
): Promise<void> {
  try {
    const { version } = findGameVersion(api, gameId, versionId);
    const result = await api.showDialog(
      "question",
      `Install ${version.label}?`,
      {
        text:
          "Vortex purges your mods, then Steam downloads this version into the game folder. " +
          "Steam may update the game again unless automatic updates are off for it.",
      },
      [{ label: "Cancel" }, { label: "Install", default: true }],
    );
    if (result.action !== "Install") {
      return;
    }
    api.store.dispatch(actions.setDialogVisible(undefined));
    await installGameVersion(api, gameId, versionId);
  } catch (err) {
    reportError(api, INSTALL_VERSION_FAILED, err);
  }
}
