import { ISteamKitParameters } from "../types/interface";
import { IGameVersion } from "./types";

/** What steamkit downloads to put a game at a version: each depot at its manifest, in the game folder. */
export function versionRunParameters(
  steamAppId: number,
  installDirectory: string,
  version: IGameVersion,
): ISteamKitParameters {
  return {
    AppId: steamAppId,
    InstallDirectory: installDirectory,
    DepotIdList: version.depots.map((depot) => depot.depotId),
    ManifestIdList: version.depots.map((depot) => depot.manifestId),
    // Reuses the parts of the installed files that already match.
    VerifyAll: true,
    ...(version.branch !== undefined ? { Branch: version.branch } : {}),
  };
}
