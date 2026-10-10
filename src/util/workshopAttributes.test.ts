import { describe, expect, it } from "vitest";

import type { IWorkshopMod } from "../types/interface";
import { AUTHOR_MODINFO_KEY, workshopAttributeExtractor } from "./workshopAttributes";

const ITEM = {
  publishedfileid: "2413210890",
  creator: "76561197999215804",
  title: "Game Starts -- Flesh is Weak Series",
  short_description: "Six game starts involving robotic limbs",
  preview_url: "https://images.steamusercontent.com/ugc/1768197795099861197/preview.jpg",
  time_updated: 1614742478,
} as IWorkshopMod;

const downloadOf = (modInfo: Record<string, unknown>) => ({ download: { modInfo } });

const steamkitDownload = (extra: Record<string, unknown> = {}) =>
  downloadOf({ source: "website", steamkit: JSON.stringify(ITEM), ...extra });

describe("workshopAttributeExtractor", () => {
  it("names the mod after its Workshop title", async () => {
    const attributes = await workshopAttributeExtractor(steamkitDownload());

    expect(attributes).toMatchObject({ logicalFileName: ITEM.title, name: ITEM.title });
  });

  it("links the mod to its Workshop page", async () => {
    const attributes = await workshopAttributeExtractor(steamkitDownload());

    expect(attributes.url).toBe("https://steamcommunity.com/sharedfiles/filedetails/?id=2413210890");
  });

  it("versions the mod by the date of the item's last Workshop update, as semver", async () => {
    const attributes = await workshopAttributeExtractor(steamkitDownload());

    expect(attributes.version).toBe("2021.3.3");
  });

  it("credits the creator the download recorded", async () => {
    const attributes = await workshopAttributeExtractor(steamkitDownload({ [AUTHOR_MODINFO_KEY]: "Upgrade Seeker" }));

    expect(attributes.author).toBe("Upgrade Seeker");
  });

  it("keeps the item's description, picture and id", async () => {
    const attributes = await workshopAttributeExtractor(steamkitDownload());

    expect(attributes).toMatchObject({
      description: ITEM.short_description,
      pictureUrl: ITEM.preview_url,
      publishedfileid: ITEM.publishedfileid,
    });
  });

  it("leaves mods from other sources alone", async () => {
    expect(await workshopAttributeExtractor(downloadOf({ source: "nexus" }))).toEqual({});
    expect(await workshopAttributeExtractor({})).toEqual({});
  });
});
