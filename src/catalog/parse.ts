import * as z from "zod";

import {
  CatalogDocument,
  DepotManifest,
  GameEntry,
  GameVersion,
  ICatalog,
  IDepotManifest,
  IGameEntry,
  IGameVersion,
} from "./types";

/** A catalog read from untrusted JSON, with what was dropped from it and why. */
interface IParsedCatalog {
  catalog: ICatalog | undefined;
  problems: string[];
}

const describeIssues = (error: z.ZodError): string =>
  error.issues.map((issue) => `${issue.path.join(".") || "value"}: ${issue.message}`).join("; ");

function parseGame(gameId: string, raw: unknown, problems: string[]): IGameEntry | undefined {
  const game = GameEntry.safeParse(raw);
  if (!game.success) {
    problems.push(`${gameId}: ${describeIssues(game.error)}`);
    return undefined;
  }
  const versions: IGameVersion[] = [];
  for (const rawVersion of game.data.versions) {
    const version = GameVersion.safeParse(rawVersion);
    if (!version.success) {
      const id = (rawVersion as { id?: unknown } | null)?.id;
      const name = typeof id === "string" ? `version ${id}` : "a version";
      problems.push(`${gameId}: ${name}: ${describeIssues(version.error)}`);
    } else if (versions.some((existing) => existing.id === version.data.id)) {
      problems.push(`${gameId}: version ${version.data.id} is listed twice`);
    } else {
      versions.push(version.data);
    }
  }
  return { steamAppId: game.data.steamAppId, versions };
}

/** Reads a catalog, dropping the games and versions it cannot use. */
export function parseCatalog(input: unknown): IParsedCatalog {
  const document = CatalogDocument.safeParse(input);
  if (!document.success) {
    return { catalog: undefined, problems: [describeIssues(document.error)] };
  }
  const problems: string[] = [];
  const catalog: ICatalog = {};
  for (const [gameId, rawGame] of Object.entries(document.data.games)) {
    const game = parseGame(gameId, rawGame, problems);
    if (game !== undefined) {
      catalog[gameId] = game;
    }
  }
  return { catalog, problems };
}

/** The depots in pasted text, as the editor takes them. */
interface IParsedDepots {
  depots: IDepotManifest[];
  problems: string[];
}

const DOWNLOAD_DEPOT = "download_depot";

/**
 * Reads one depot per line: `<depotId> <manifestId>`, or a Steam console
 * `download_depot <appId> <depotId> <manifestId>` command naming the given app.
 */
export function parseDepotLines(text: string, steamAppId?: number): IParsedDepots {
  const depots: IDepotManifest[] = [];
  const problems: string[] = [];
  for (const line of text.split(/\r?\n/).map((entry) => entry.trim()).filter((entry) => entry !== "")) {
    let fields = line.split(/[\s,:]+/);
    if (fields[0].toLowerCase() === DOWNLOAD_DEPOT) {
      if (steamAppId !== undefined && Number(fields[1]) !== steamAppId) {
        problems.push(`"${line}" is for app ${fields[1]}, not ${steamAppId}`);
        continue;
      }
      fields = fields.slice(2);
    }
    const depot =
      fields.length === 2
        ? DepotManifest.safeParse({ depotId: Number(fields[0]), manifestId: fields[1] })
        : undefined;
    if (depot?.success === true) {
      depots.push(depot.data);
    } else {
      problems.push(`"${line}" is not a depot id followed by a manifest id`);
    }
  }
  return { depots, problems };
}
