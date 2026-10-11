import { parseCatalog } from "../../src/catalog/parse";
import type { ICandidateBuild } from "./candidates";
import type { ISourcesConfig } from "./config";
import { IAddedVersion, IRawCatalog, mergeCandidates, relevantDepots } from "./merge";
import { butrCandidates, IButrFeed } from "./sources/butr";
import { appInfoCandidates, IAppInfo } from "./sources/steamAppInfo";

/** What the sources read, fetched beforehand; a source that failed is missing, with its error noted. */
export interface ISourceData {
  // keyed by Vortex game id
  appInfo: Record<string, IAppInfo>;
  // keyed by Steam app id
  butrFeeds: Record<number, IButrFeed>;
  /** Sources that couldn't be read, and why. */
  failures: string[];
}

export interface IGameReport {
  gameId: string;
  added: IAddedVersion[];
  notes: string[];
}

export interface IUpdateResult {
  catalog: IRawCatalog;
  games: IGameReport[];
  failures: string[];
}

/** Adds what the sources know beyond the catalog; a catalog the extension wouldn't read whole is an error. */
export function updateCatalog(catalog: IRawCatalog, config: ISourcesConfig, data: ISourceData): IUpdateResult {
  const games: IGameReport[] = [];
  const updated: IRawCatalog = { ...catalog, games: { ...catalog.games } };
  for (const [gameId, game] of Object.entries(catalog.games)) {
    const sources = config.games[gameId] ?? {};
    const depotIds = sources.depots ?? relevantDepots(game);
    const notes: string[] = [];
    const candidates: ICandidateBuild[] = [];

    const feed = sources.butr !== undefined ? data.butrFeeds[game.steamAppId] : undefined;
    if (feed !== undefined) {
      candidates.push(...butrCandidates(feed, sources.butr.history));
    }
    const appInfo = data.appInfo[gameId];
    if (appInfo?.error !== undefined) {
      notes.push(`Steam app info: ${appInfo.error}`);
    } else if (appInfo !== undefined) {
      candidates.push(...appInfoCandidates(appInfo, depotIds, sources.labels ?? {}));
    }

    const merged = mergeCandidates(game, depotIds, candidates);
    updated.games[gameId] = merged.game;
    notes.push(...merged.rejected);
    if (merged.added.length > 0 || notes.length > 0) {
      games.push({ gameId, added: merged.added, notes });
    }
  }

  // parseCatalog notes every game and version it drops.
  const { problems } = parseCatalog(updated);
  if (problems.length > 0) {
    throw new Error(`The updated catalog doesn't read whole: ${problems.join("; ")}`);
  }
  return { catalog: updated, games, failures: data.failures };
}

/** The pull request body for an update. */
export function summarize(result: IUpdateResult): string {
  const lines: string[] = [];
  const added = result.games.filter((game) => game.added.length > 0);
  lines.push(
    added.length > 0
      ? `Adds ${added.reduce((sum, game) => sum + game.added.length, 0)} versions to ${added.length} games.`
      : "Adds no versions.",
  );
  for (const game of result.games) {
    lines.push("", `**${game.gameId}**`);
    for (const version of game.added) {
      const branch = version.branch !== undefined ? `, branch \`${version.branch}\`` : "";
      lines.push(`- ${version.label} (build ${version.buildId}${branch}, from ${version.source})`);
    }
    lines.push(...game.notes.map((note) => `- Note: ${note}`));
  }
  if (result.failures.length > 0) {
    lines.push("", "**Sources that failed**", ...result.failures.map((failure) => `- ${failure}`));
  }
  const unnamed = result.games.some((game) => game.added.some((version) => version.unnamed));
  if (unnamed) {
    lines.push(
      "",
      'A version labelled "Build N" is a default-branch build no source named. Rename its label in catalog.json before merging; later runs keep the new label.',
    );
  }
  return lines.join("\n") + "\n";
}
