import { actions, selectors, types } from "@nexusmods/vortex-api";

import { INSTALL_VERSION_FAILED, installVersionJob } from "../jobs";
import { readInstalledManifests, runDownloader } from "../native";
import { builtInCatalog, steamAppIdFor, userVersions } from "../selectors";
import { ErrorKind, SteamkitError } from "../types/errors";
import { reportError } from "../util/errors";
import type { IPromptServices } from "../delegates/UI";
import { verifyIsSteamGame, withModsPurged } from "../util/steamGame";
import { runSteamJob } from "../util/steamJob";
import { isInstalledVersion, listGameVersions } from "./catalog";
import { versionRunParameters } from "./install";
import { IListedVersion } from "./types";

/** A game's versions: the built-in ones first, then the user's own. */
function gameVersions(state: unknown, gameId: string): IListedVersion[] {
  return listGameVersions(builtInCatalog(state), userVersions(state), gameId);
}

/** The manifest each of the game's installed depots is at, keyed by depot id; empty when nothing records it. */
export async function readGameManifests(state: unknown, gameId: string): Promise<ReadonlyMap<number, string>> {
  const steamAppId = steamAppIdFor(state, gameId);
  const installPath = selectors.discoveryByGame(state, gameId)?.path;
  if (steamAppId === undefined || installPath === undefined) {
    return new Map();
  }
  return readInstalledManifests(steamAppId, installPath);
}

/** A game's versions, each with whether the game is at it. */
export async function gameVersionsWithInstalled(
  state: unknown,
  gameId: string,
): Promise<Array<IListedVersion & { installed: boolean }>> {
  const manifests = await readGameManifests(state, gameId);
  return gameVersions(state, gameId).map((listed) => ({
    ...listed,
    installed: isInstalledVersion(listed.version, manifests),
  }));
}

function findGameVersion(state: unknown, gameId: string, versionId: string): IListedVersion {
  const listed = gameVersions(state, gameId).find((entry) => entry.version.id === versionId);
  if (listed === undefined) {
    throw new SteamkitError(ErrorKind.InvalidInput, `${gameId} has no version ${versionId}`);
  }
  return listed;
}

/** Puts the game at a version: Steam downloads that version's depots into the game folder. */
export async function installGameVersion(
  api: types.IExtensionApi,
  services: IPromptServices,
  gameId: string,
  versionId: string,
): Promise<void> {
  const { version } = findGameVersion(api.getState(), gameId, versionId);
  await runSteamJob(api, services, installVersionJob(version.label), async (ui, signal) => {
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

const ConfirmAction = { Cancel: "Cancel", Install: "Install" } as const;

/** Asks the user to confirm, then puts the game at the version. */
export async function confirmAndInstallGameVersion(
  api: types.IExtensionApi,
  services: IPromptServices,
  gameId: string,
  versionId: string,
): Promise<void> {
  try {
    const { version } = findGameVersion(api.getState(), gameId, versionId);
    const result = await api.showDialog(
      "question",
      `Install ${version.label}?`,
      {
        text:
          "Vortex purges your mods, then Steam downloads this version into the game folder. " +
          "Steam may update the game again unless automatic updates are off for it.",
      },
      [{ label: ConfirmAction.Cancel }, { label: ConfirmAction.Install, default: true }],
    );
    if (result.action !== ConfirmAction.Install) {
      return;
    }
    api.store.dispatch(actions.setDialogVisible(undefined));
    await installGameVersion(api, services, gameId, versionId);
  } catch (err) {
    reportError(api, INSTALL_VERSION_FAILED, err);
  }
}
