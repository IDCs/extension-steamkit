import { actions, selectors, types, util } from "@nexusmods/vortex-api";

import { steamAppIdFor } from "../selectors";
import { ErrorKind, SteamkitError } from "../types/errors";
import { ISteamKitParameters } from "../types/interface";

/**
 * What verifying a game's files runs: the game's Steam app and folder unless the caller names others, checking
 * every file unless told otherwise.
 */
export function verifyRunParameters(
  state: unknown,
  gameId: string,
  parameters: ISteamKitParameters = {},
): ISteamKitParameters {
  return {
    AppId: steamAppIdFor(state, gameId),
    InstallDirectory: selectors.discoveryByGame(state, gameId)?.path,
    VerifyAll: true,
    ...parameters,
    ManifestOnly: true,
  };
}

/** Whether Steam installed the game where Vortex found it; false for a game Vortex hasn't found. */
export async function isSteamGame(
  steamAppId: number | undefined,
  discovery: types.IDiscoveryResult | undefined,
): Promise<boolean> {
  if (steamAppId === undefined || discovery?.path === undefined) {
    return false;
  }
  let gameEntry;
  try {
    gameEntry = await util.GameStoreHelper.findByAppId([String(steamAppId)], "steam");
  } catch {
    return false;
  }
  const normalize = await util.getNormalizeFunc(discovery.path);
  return normalize(gameEntry.gamePath) === normalize(discovery.path);
}

/** Rejects with a NotSteamGame error unless Steam installed the game where Vortex found it. */
export async function verifyIsSteamGame(
  steamAppId: number | undefined,
  discovery: types.IDiscoveryResult | undefined,
): Promise<void> {
  if (!(await isSteamGame(steamAppId, discovery))) {
    throw new SteamkitError(
      ErrorKind.NotSteamGame,
      "Steam did not install the game where Vortex found it",
    );
  }
}

function purge(api: types.IExtensionApi) {
  return new Promise<void>((resolve, reject) =>
    api.events.emit("purge-mods", true, (err) => (err ? reject(err) : resolve())),
  );
}

/**
 * Runs a change Steam makes to the game's files: deployed mods are purged first and redeployed after.
 * Nothing is purged once the signal is aborted; a change cancelled part-way warns the user.
 */
export async function withModsPurged<T>(
  api: types.IExtensionApi,
  gameId: string,
  signal: AbortSignal,
  change: () => Promise<T>,
): Promise<T> {
  signal.throwIfAborted();
  await purge(api);
  try {
    return await change();
  } catch (err) {
    if (signal.aborted) {
      api.sendNotification({
        id: "steamkit_change_cancelled",
        type: "warning",
        message: "Cancelled - game files may be incomplete. Verify files to repair.",
      });
    }
    throw err;
  } finally {
    api.store.dispatch(actions.setDeploymentNecessary(gameId, true));
  }
}
