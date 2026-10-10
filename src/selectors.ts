import { selectors, types } from "@nexusmods/vortex-api";

import { EMPTY_CATALOG } from "./catalog/catalog";
import { ICatalog, IGameVersion } from "./catalog/types";

// keyed by Vortex game id
const NO_USER_VERSIONS: Record<string, IGameVersion[]> = {};

/** The built-in catalog, empty until it has loaded. */
export const builtInCatalog = (state: any): ICatalog =>
  state.session?.steamkit?.builtInCatalog ?? EMPTY_CATALOG;

/** The versions the user defined, keyed by Vortex game id. */
export const userVersions = (state: any): Record<string, IGameVersion[]> =>
  state.persistent?.steamkit?.userVersions ?? NO_USER_VERSIONS;

// keyed by Vortex mod id
const NO_MODS: Record<string, types.IMod> = {};

/** The game's installed mods, keyed by mod id. */
export const gameMods = (state: any, gameId: string | undefined): Record<string, types.IMod> =>
  (gameId !== undefined ? state.persistent?.mods?.[gameId] : undefined) ?? NO_MODS;

/**
 * The game's Steam app id: the catalog's, else the game's own. Vortex fills the game's from its details,
 * environment or Steam store query when it registers the game.
 */
export function steamAppIdFor(state: any, gameId: string): number | undefined {
  const declared = selectors.gameById(state, gameId)?.details?.steamAppId;
  return builtInCatalog(state)[gameId]?.steamAppId ?? (declared === undefined ? undefined : Number(declared));
}

/** Whether the Steam page and its actions are offered for the game. */
export function offersSteamFeatures(state: any, gameId: string | undefined): boolean {
  return (
    gameId !== undefined &&
    selectors.gameById(state, gameId)?.details?.hideSteamKit !== true &&
    steamAppIdFor(state, gameId) !== undefined
  );
}
