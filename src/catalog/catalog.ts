import { errorMessage } from "../util/errors";
import { parseCatalog } from "./parse";
import { ICatalog, IGameVersion, IListedVersion, VersionSource } from "./types";

interface ILoadedCatalog {
  catalog: ICatalog;
  /** Why the remote catalog was not used, and what was dropped from the one that was. */
  problems: string[];
}

export const EMPTY_CATALOG: ICatalog = {};

const CATALOG_FETCH_TIMEOUT_MS = 10_000;

/** A catalog document from a URL, unread. */
export async function fetchCatalog(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(CATALOG_FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }
  return response.json();
}

/** The built-in catalog: the remote copy when it can be fetched and read, else the bundled one. */
export async function loadBuiltInCatalog(
  bundled: unknown,
  fetchRemote: () => Promise<unknown>,
): Promise<ILoadedCatalog> {
  const problems: string[] = [];
  try {
    const remote = parseCatalog(await fetchRemote());
    if (remote.catalog !== undefined) {
      return { catalog: remote.catalog, problems: remote.problems };
    }
    problems.push(...remote.problems.map((problem) => `remote catalog: ${problem}`));
  } catch (err) {
    problems.push(`remote catalog: ${errorMessage(err)}`);
  }
  const local = parseCatalog(bundled);
  return { catalog: local.catalog ?? EMPTY_CATALOG, problems: [...problems, ...local.problems] };
}

/** A game's versions: the built-in ones first, then the user's own. */
export function listGameVersions(
  builtIn: ICatalog,
  // keyed by Vortex game id
  userVersions: Record<string, IGameVersion[]>,
  gameId: string,
): IListedVersion[] {
  const builtInVersions = builtIn[gameId]?.versions ?? [];
  const builtInIds = new Set(builtInVersions.map((version) => version.id));
  return [
    ...builtInVersions.map((version) => ({ source: VersionSource.BuiltIn, version })),
    ...(userVersions[gameId] ?? [])
      .filter((version) => !builtInIds.has(version.id))
      .map((version) => ({ source: VersionSource.User, version })),
  ];
}

/** Whether the game is at the version: each of its depots is installed at its manifest. */
export function isInstalledVersion(
  version: IGameVersion,
  // keyed by depot id
  installedManifests: ReadonlyMap<number, string>,
): boolean {
  return version.depots.every((depot) => installedManifests.get(depot.depotId) === depot.manifestId);
}

/** Why the user's version cannot be saved; `editedId` is the edited version's id, which it may keep. */
export function validateUserVersion(
  listed: IListedVersion[],
  version: IGameVersion,
  editedId?: string,
): string[] {
  const problems: string[] = [];
  const clash = listed.find((entry) => entry.version.id === version.id);
  if (version.id === "") {
    problems.push("A version needs a name");
  } else if (clash?.source === VersionSource.BuiltIn) {
    problems.push(`"${version.id}" is a built-in version`);
  } else if (clash !== undefined && version.id !== editedId) {
    problems.push(`You already have a version called "${version.id}"`);
  }
  if (version.depots.length === 0) {
    problems.push("A version needs at least one depot");
  }
  return problems;
}
