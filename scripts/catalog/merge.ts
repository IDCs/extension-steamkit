import type * as z from "zod";

import type { GameVersion } from "../../src/catalog/types";
import { ICandidateBuild } from "./candidates";

/** A version as the catalog file holds it, unknown fields included. */
export type IRawVersion = z.input<typeof GameVersion>;

export interface IRawGame extends Record<string, unknown> {
  steamAppId: number;
  versions: IRawVersion[];
}

export interface IRawCatalog {
  schemaVersion: number;
  // keyed by Vortex game id
  games: Record<string, IRawGame>;
}

/** A version the merge added, for the update summary. */
export interface IAddedVersion {
  id: string;
  label: string;
  branch?: string;
  buildId: number;
  source: string;
  /** Whether the label is only the build id. */
  unnamed: boolean;
}

export interface IMergedGame {
  game: IRawGame;
  added: IAddedVersion[];
  /** Candidates that couldn't be added, and why. */
  rejected: string[];
}

/** The depots a game's versions pin: those of its newest listed version. */
export const relevantDepots = (game: IRawGame): number[] =>
  (game.versions[0]?.depots ?? []).map((depot) => depot.depotId).sort((lhs, rhs) => lhs - rhs);

/** What tells builds apart: the manifest of each relevant depot; undefined when one is missing. */
export function buildKey(manifests: Record<string, string>, depotIds: number[]): string | undefined {
  const pinned = depotIds.map((depotId) => manifests[String(depotId)]);
  return pinned.some((manifestId) => manifestId === undefined)
    ? undefined
    : depotIds.map((depotId, index) => `${depotId}:${pinned[index]}`).join(",");
}

// keyed by depot id
const manifestsOf = (version: IRawVersion): Record<string, string> =>
  Object.fromEntries(version.depots.map((depot) => [String(depot.depotId), depot.manifestId]));

/** A version id from its label, as the catalog's ids are written. */
export const versionId = (label: string): string =>
  label
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "");

const describe = (candidate: ICandidateBuild): string =>
  `${candidate.source} build ${candidate.buildId}${candidate.branch !== undefined ? ` on branch ${candidate.branch}` : ""}`;

/** The branch a build downloads from: none if the default branch serves it, else the shortest name. */
function branchOf(builds: ICandidateBuild[]): string | undefined {
  const branches = builds.map((candidate) => candidate.branch);
  if (branches.includes(undefined)) {
    return undefined;
  }
  return (branches as string[]).sort((lhs, rhs) => lhs.length - rhs.length || lhs.localeCompare(rhs))[0];
}

interface IPlacedVersion {
  version: IRawVersion;
  buildId: number | undefined;
}

/**
 * Adds the builds the game doesn't list, named by the first source that labels them, else by build id. A build a
 * branch serves goes on top; a past build is placed by build id.
 */
export function mergeCandidates(game: IRawGame, depotIds: number[], candidates: ICandidateBuild[]): IMergedGame {
  const rejected: string[] = [];
  // keyed by build key, each build's candidates in source order
  const candidatesByBuild = new Map<string, ICandidateBuild[]>();
  for (const candidate of candidates) {
    const key = buildKey(candidate.manifests, depotIds);
    if (key === undefined) {
      // A past build without one of the depots predates it.
      if (!candidate.historical) {
        rejected.push(`${describe(candidate)} lacks one of depots ${depotIds.join(", ")}`);
      }
      continue;
    }
    candidatesByBuild.set(key, [...(candidatesByBuild.get(key) ?? []), candidate]);
  }

  const listedKeys = game.versions.map((version) => buildKey(manifestsOf(version), depotIds));
  const listed: IPlacedVersion[] = game.versions.map((version, index) => ({
    version,
    buildId: listedKeys[index] !== undefined ? candidatesByBuild.get(listedKeys[index])?.[0].buildId : undefined,
  }));
  const usedIds = new Set(game.versions.map((version) => version.id));
  const added: IAddedVersion[] = [];
  const current: IPlacedVersion[] = [];
  const past: IPlacedVersion[] = [];

  for (const [key, builds] of candidatesByBuild) {
    if (listedKeys.includes(key)) {
      continue;
    }
    const first = builds[0];
    const named = builds.find((candidate) => candidate.label !== undefined);
    const onDefaultBranch = builds.find((candidate) => candidate.branch === undefined && !candidate.historical);
    const label = named?.label ?? (onDefaultBranch !== undefined ? `Build ${onDefaultBranch.buildId}` : undefined);
    if (label === undefined) {
      rejected.push(`${describe(first)} has no label; add one to catalog.sources.json`);
      continue;
    }
    let id = versionId(label);
    if (usedIds.has(id)) {
      id = `${id}-${first.buildId}`;
    }
    if (id === "" || usedIds.has(id)) {
      rejected.push(`${describe(first)}, labelled ${label}, has no free id`);
      continue;
    }
    usedIds.add(id);
    const branch = branchOf(builds);
    const version: IRawVersion = {
      id,
      label,
      ...(branch !== undefined ? { branch } : {}),
      depots: depotIds.map((depotId) => ({ depotId, manifestId: first.manifests[String(depotId)] })),
    };
    added.push({ id, label, branch, buildId: first.buildId, source: (named ?? first).source, unnamed: named === undefined });
    (builds.every((candidate) => candidate.historical) ? past : current).push({ version, buildId: first.buildId });
  }

  const newestFirst = (lhs: IPlacedVersion, rhs: IPlacedVersion) => rhs.buildId! - lhs.buildId!;
  const versions = [...current.sort(newestFirst), ...listed];
  for (const entry of past.sort(newestFirst)) {
    const olderIndex = versions.findIndex((placed) => placed.buildId !== undefined && placed.buildId < entry.buildId!);
    versions.splice(olderIndex === -1 ? versions.length : olderIndex, 0, entry);
  }
  return {
    game: { ...game, versions: versions.map((placed) => placed.version) },
    added: added.sort((lhs, rhs) => rhs.buildId - lhs.buildId),
    rejected,
  };
}
