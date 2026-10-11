import { ICandidateBuild, isPinnedBranch, PUBLIC_BRANCH } from "../candidates";

/** BUTR's record of a Steam app's builds (github.com/BUTR/Bannerlord.ReferenceAssemblies, builds/steam). */
export interface IButrFeed {
  appId: number;
  // keyed by branch name, the build each branch serves
  current: Record<string, number>;
  builds: Array<{
    buildId: number;
    version: string | null;
    /** The branches BUTR saw serving the build. */
    branches: string[];
    // keyed by depot id
    manifests: Record<string, string>;
  }>;
}

export const butrFeedUrl = (appId: number): string =>
  `https://raw.githubusercontent.com/BUTR/Bannerlord.ReferenceAssemblies/master/builds/steam/${appId}.json`;

const SOURCE = "BUTR";

/** The named builds of a BUTR feed, newest first: those pinned branches serve, and with history the others too. */
export function butrCandidates(feed: IButrFeed, history: boolean): ICandidateBuild[] {
  // keyed by build id, the pinned branches serving it
  const branchesByBuild = new Map<number, string[]>();
  for (const [branchName, buildId] of Object.entries(feed.current)) {
    if (isPinnedBranch(branchName)) {
      branchesByBuild.set(buildId, [...(branchesByBuild.get(buildId) ?? []), branchName]);
    }
  }

  const named = feed.builds.filter(
    (build): build is IButrFeed["builds"][number] & { version: string } => build.version !== null,
  );
  const served = named.filter((build) => branchesByBuild.has(build.buildId));
  const servedVersions = new Set(served.map((build) => build.version));
  // A version no branch serves, by its newest build that a pinned branch once served; a beta-only build isn't a release.
  const unserved = history
    ? named
        .filter((build) => !servedVersions.has(build.version) && build.branches.some(isPinnedBranch))
        .sort((lhs, rhs) => rhs.buildId - lhs.buildId)
        .filter((build, index, builds) => builds.findIndex((other) => other.version === build.version) === index)
    : [];

  return [...served, ...unserved]
    .sort((lhs, rhs) => rhs.buildId - lhs.buildId)
    .map((build) => ({
      label: build.version.replace(/^v(?=\d)/, ""),
      branch: branchToPin(branchesByBuild.get(build.buildId) ?? []),
      buildId: build.buildId,
      manifests: build.manifests,
      source: SOURCE,
      historical: !branchesByBuild.has(build.buildId),
    }));
}

/** The branch a version downloads from: none for the default branch, else the shortest name serving it. */
function branchToPin(branches: string[]): string | undefined {
  if (branches.length === 0 || branches.includes(PUBLIC_BRANCH)) {
    return undefined;
  }
  return [...branches].sort((lhs, rhs) => lhs.length - rhs.length || lhs.localeCompare(rhs))[0];
}
