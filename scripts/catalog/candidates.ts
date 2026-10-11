/** A build a source found: what it is called, where Steam serves it, and its depots' manifests. */
export interface ICandidateBuild {
  /** Undefined when the source can't tell the version. */
  label: string | undefined;
  /** The Steam branch that serves the build; undefined for the default branch. */
  branch?: string;
  buildId: number;
  // keyed by depot id
  manifests: Record<string, string>;
  /** The source that found the build, for the update summary. */
  source: string;
  /** Whether no branch serves the build. */
  historical?: boolean;
}

/** The default Steam branch, which a download needs no branch name for. */
export const PUBLIC_BRANCH = "public";

// Branches that move, test, or target another platform; a version pinned to one would mislabel itself.
const MOVING_OR_FOREIGN_BRANCH = new RegExp(
  [
    "experimental",
    "beta(?!\\d)",
    "unstable",
    "prerelease",
    "testing",
    "release_candidate",
    "development",
    "debug",
    "^local$",
    "(?<!la)test",
    "^oldstable$",
    "^public_previous_update$",
    "^opt_in_update$",
    "linux",
    "mac",
    "coming_in_hot",
    "il2cpp",
    "demos",
    "symlink",
    "tcplink",
    "^console$",
    "^previous$",
    "^dlc2_may11$",
    "^pre_dlc",
    "^version1\\.0$",
    "^windows7$",
  ].join("|"),
  "i",
);

/** Whether a branch holds a fixed build worth listing: the default branch, or one that doesn't move. */
export function isPinnedBranch(branchName: string): boolean {
  return branchName === PUBLIC_BRANCH || !MOVING_OR_FOREIGN_BRANCH.test(branchName);
}
