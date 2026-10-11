import type { types } from "@nexusmods/vortex-api";

/** The Workshop items a game's mods, keyed by mod id, were installed from, by published file id. */
export function installedWorkshopItemIds(mods: Record<string, types.IMod>): Set<string> {
  const publishedFileIds = Object.values(mods)
    .map((mod) => mod.attributes?.publishedfileid)
    .filter((publishedFileId): publishedFileId is string => typeof publishedFileId === "string");
  return new Set(publishedFileIds);
}
