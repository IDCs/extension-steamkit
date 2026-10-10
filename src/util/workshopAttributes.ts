import { workshopItemUrl } from "../constants";
import type { IWorkshopMod } from "../types/interface";

/** The download's modInfo key holding the Workshop item creator's Steam name. */
export const AUTHOR_MODINFO_KEY = "steamkitAuthor";

/**
 * Workshop items have no version; the UTC date of the last update stands in for one, written as semver
 * (year.month.day, no leading zeros) so Vortex accepts it and versions sort in update order.
 */
function updateDateVersion(timeUpdatedSeconds: number): string {
  const updated = new Date(timeUpdatedSeconds * 1000);
  return `${updated.getUTCFullYear()}.${updated.getUTCMonth() + 1}.${updated.getUTCDate()}`;
}

interface IExtractorInput {
  download?: { modInfo?: Record<string, unknown> };
}

/**
 * The attributes of a mod installed from a Workshop item steamkit downloaded; none for other mods.
 * Registered below Vortex's own extractors, so its name wins over the archive's file name.
 */
export async function workshopAttributeExtractor(input: IExtractorInput): Promise<Record<string, string>> {
  const modInfo = input.download?.modInfo;
  if (typeof modInfo?.steamkit !== "string") {
    return {};
  }
  const item: IWorkshopMod = JSON.parse(modInfo.steamkit);
  const author = modInfo[AUTHOR_MODINFO_KEY];
  return {
    name: item.title,
    logicalFileName: item.title,
    url: workshopItemUrl(item.publishedfileid),
    version: updateDateVersion(item.time_updated),
    description: item.short_description,
    pictureUrl: item.preview_url,
    publishedfileid: item.publishedfileid,
    ...(typeof author === "string" ? { author } : {}),
  };
}
