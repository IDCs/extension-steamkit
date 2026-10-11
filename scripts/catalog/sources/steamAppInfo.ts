import { ICandidateBuild, isPinnedBranch, PUBLIC_BRANCH } from "../candidates";

/** A Steam app's public app info, as tools/SteamAppInfo writes it. */
export interface IAppInfo {
  gameId: string;
  appId: number;
  error?: string;
  // keyed by branch name
  branches?: Record<string, { buildId: string; description: string | null; passwordRequired: boolean }>;
  // keyed by depot id
  depots?: Record<string, { manifests: Record<string, string>; encryptedManifests: string[] }>;
}

const SOURCE = "Steam";

/**
 * The builds the app's pinned branches serve, with the given depots. The default branch is unlabelled; it moves.
 * @param labels Labels by branch name, for branches whose name doesn't say the version.
 */
export function appInfoCandidates(
  app: IAppInfo,
  depotIds: number[],
  labels: Record<string, string>,
): ICandidateBuild[] {
  const candidates: ICandidateBuild[] = [];
  for (const [branchName, branch] of Object.entries(app.branches ?? {})) {
    const isDefault = branchName === PUBLIC_BRANCH;
    if (!isPinnedBranch(branchName) || (!isDefault && branch.passwordRequired)) {
      continue;
    }
    const manifests = branchManifests(app, branchName, depotIds);
    if (manifests === undefined) {
      continue;
    }
    candidates.push({
      label: isDefault ? undefined : (labels[branchName] ?? labelOf(app.gameId, branchName, branch.description)),
      branch: isDefault ? undefined : branchName,
      buildId: Number(branch.buildId),
      manifests,
      source: SOURCE,
    });
  }
  return candidates;
}

/** The branch's manifests of the given depots; undefined unless Steam lists every one, unencrypted. */
function branchManifests(app: IAppInfo, branchName: string, depotIds: number[]): Record<string, string> | undefined {
  // keyed by depot id
  const manifests: Record<string, string> = {};
  for (const depotId of depotIds) {
    const depot = app.depots?.[String(depotId)];
    const manifestId = depot?.manifests[branchName];
    if (manifestId === undefined || depot.encryptedManifests.includes(branchName)) {
      return undefined;
    }
    manifests[String(depotId)] = manifestId;
  }
  return manifests;
}

/** A version label from a named branch's name or description; undefined when neither says the version. */
export function labelOf(gameId: string, branchName: string, description: string | null): string | undefined {
  const describedAs = (description ?? "").trim();
  if (gameId === "x4foundations" && describedAs !== "") {
    return describedAs.replace(/^Version /, "").replace(/ \(legacy\)$/, "");
  }
  if (gameId === "factorio" && describedAs.includes("Experimental")) {
    return `${branchName} (experimental)`;
  }
  if (/^previousversion_u[\d.]+$/.test(branchName) && describedAs !== "") {
    return describedAs;
  }
  let match = /^(?:v|previousversion_|previous_|version[_-])(\d[\w.]*)$/.exec(branchName);
  if (match !== null) {
    return match[1];
  }
  match = /^(alpha|beta)(\d[\d.]*)$/.exec(branchName);
  if (match !== null) {
    return `${match[1][0].toUpperCase()}${match[1].slice(1)} ${match[2]}`;
  }
  match = /^build(\d[\d.]*)$/.exec(branchName);
  if (match !== null) {
    return `Build ${match[1]}`;
  }
  return /^(?:\d[\w.]*|e\d[\d.]*)$/.test(branchName) ? branchName : undefined;
}
