import type { ICandidateBuild } from "../scripts/catalog/candidates";
import type { IRawCatalog, IRawGame, IRawVersion } from "../scripts/catalog/merge";
import type { IButrFeed } from "../scripts/catalog/sources/butr";
import type { IAppInfo } from "../scripts/catalog/sources/steamAppInfo";
import type { ISourceData } from "../scripts/catalog/update";
import { CATALOG_SCHEMA_VERSION } from "../src/catalog/types";

export const BANNERLORD_GAME_ID = "mountandblade2bannerlord";
export const BANNERLORD_APP_ID = 261550;
/** Bannerlord's base game depots, the ones its versions pin. */
export const BANNERLORD_DEPOT_IDS = [261551, 261552];
/** The War Sails DLC depot, which versions don't pin. */
export const WAR_SAILS_DEPOT_ID = 2927200;

/** Bannerlord's depot manifests for a build, made from the build id so every build differs. */
export const bannerlordManifests = (buildId: number): Record<string, string> =>
  Object.fromEntries(BANNERLORD_DEPOT_IDS.map((depotId, index) => [String(depotId), `${buildId}${index}`]));

export function candidate(
  label: string | undefined,
  buildId: number,
  overrides: Partial<ICandidateBuild> = {},
): ICandidateBuild {
  return { label, buildId, manifests: bannerlordManifests(buildId), source: "Test", ...overrides };
}

/** A catalog version of a build, labelled by its id. */
export function rawVersion(id: string, buildId: number, overrides: Partial<IRawVersion> = {}): IRawVersion {
  return {
    id,
    label: id,
    depots: Object.entries(bannerlordManifests(buildId)).map(([depotId, manifestId]) => ({
      depotId: Number(depotId),
      manifestId,
    })),
    ...overrides,
  };
}

export const rawGame = (...versions: IRawVersion[]): IRawGame => ({ steamAppId: BANNERLORD_APP_ID, versions });

export const rawCatalog = (game: IRawGame): IRawCatalog => ({
  schemaVersion: CATALOG_SCHEMA_VERSION,
  games: { [BANNERLORD_GAME_ID]: game },
});

/** What the sources read for an update: nothing unless given, and no failures. */
export const sourceData = (overrides: Partial<ISourceData> = {}): ISourceData => ({
  appInfo: {},
  butrFeeds: {},
  failures: [],
  ...overrides,
});

type ButrBuild = IButrFeed["builds"][number];

export function butrBuild(buildId: number, version: string | null, overrides: Partial<ButrBuild> = {}): ButrBuild {
  return { buildId, version, branches: ["public"], manifests: bannerlordManifests(buildId), ...overrides };
}

/** A BUTR feed of Bannerlord. */
export const butrFeed = (current: Record<string, number>, ...builds: ButrBuild[]): IButrFeed => ({
  appId: BANNERLORD_APP_ID,
  current,
  builds,
});

/** Bannerlord's app info with branches serving the given builds; each depot has each branch's manifest. */
export function appInfo(branches: Record<string, number>, overrides: Partial<IAppInfo> = {}): IAppInfo {
  return {
    gameId: BANNERLORD_GAME_ID,
    appId: BANNERLORD_APP_ID,
    branches: Object.fromEntries(
      Object.entries(branches).map(([branchName, buildId]) => [
        branchName,
        { buildId: String(buildId), description: null, passwordRequired: false },
      ]),
    ),
    depots: Object.fromEntries(
      BANNERLORD_DEPOT_IDS.map((depotId) => [
        String(depotId),
        {
          manifests: Object.fromEntries(
            Object.entries(branches).map(([branchName, buildId]) => [branchName, bannerlordManifests(buildId)[String(depotId)]]),
          ),
          encryptedManifests: [],
        },
      ]),
    ),
    ...overrides,
  };
}
