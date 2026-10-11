import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  appInfo,
  BANNERLORD_APP_ID,
  BANNERLORD_DEPOT_IDS,
  BANNERLORD_GAME_ID,
  bannerlordManifests,
  butrBuild,
  butrFeed,
  rawCatalog,
  rawGame,
  rawVersion,
  sourceData,
} from "../../test/catalogUpdateFixtures";
import { formatCatalog } from "./format";
import type { IRawCatalog } from "./merge";
import { summarize, updateCatalog } from "./update";

const BUTR_SOURCES = { games: { [BANNERLORD_GAME_ID]: { butr: { history: false } } } };
const NO_SOURCES = { games: {} };
const listedIds = (catalog: IRawCatalog) => catalog.games[BANNERLORD_GAME_ID].versions.map((version) => version.id);
const catalogOf1_4_7 = () => rawCatalog(rawGame(rawVersion("1.4.7", 100)));
const steamServes = (branches: Record<string, number>) =>
  sourceData({ appInfo: { [BANNERLORD_GAME_ID]: appInfo(branches) } });

describe("updateCatalog", () => {
  it("names a new default-branch build after BUTR's version, not its build id", () => {
    const data = sourceData({
      appInfo: { [BANNERLORD_GAME_ID]: appInfo({ public: 300 }) },
      butrFeeds: { [BANNERLORD_APP_ID]: butrFeed({ public: 300 }, butrBuild(300, "v1.4.8")) },
    });

    expect(listedIds(updateCatalog(catalogOf1_4_7(), BUTR_SOURCES, data).catalog)).toEqual(["1.4.8", "1.4.7"]);
  });

  it("adds what Steam serves for a game without a BUTR feed", () => {
    const result = updateCatalog(catalogOf1_4_7(), NO_SOURCES, steamServes({ public: 100, "v1.4.6": 50 }));

    expect(listedIds(result.catalog)).toEqual(["1.4.6", "1.4.7"]);
  });

  it("notes a game Steam had no app info for, and changes nothing", () => {
    const catalog = catalogOf1_4_7();
    const data = sourceData({ appInfo: { [BANNERLORD_GAME_ID]: { ...appInfo({}), error: "no app info" } } });

    const result = updateCatalog(catalog, NO_SOURCES, data);

    expect(result.catalog).toEqual(catalog);
    expect(result.games[0].notes).toEqual(["Steam app info: no app info"]);
  });

  it("refuses a catalog the extension wouldn't read whole", () => {
    const manifests = { ...bannerlordManifests(300), [String(BANNERLORD_DEPOT_IDS[0])]: "not a manifest" };
    const data = sourceData({
      butrFeeds: { [BANNERLORD_APP_ID]: butrFeed({ public: 300 }, butrBuild(300, "v1.4.8", { manifests })) },
    });

    expect(() => updateCatalog(catalogOf1_4_7(), BUTR_SOURCES, data)).toThrow("doesn't read whole");
  });
});

describe("summarize", () => {
  it("lists each added version with its build, branch and source", () => {
    const result = updateCatalog(catalogOf1_4_7(), NO_SOURCES, {
      ...steamServes({ "v1.4.6": 50 }),
      failures: ["BUTR feed of app 1: HTTP 500"],
    });

    const summary = summarize(result);

    expect(summary).toContain("- 1.4.6 (build 50, branch `v1.4.6`, from Steam)");
    expect(summary).toContain("- BUTR feed of app 1: HTTP 500");
  });

  it("asks for a label for a build only its id names", () => {
    const result = updateCatalog(catalogOf1_4_7(), NO_SOURCES, steamServes({ public: 300 }));

    expect(summarize(result)).toContain('labelled "Build N"');
  });

  it("asks for no label for a branch named after its build", () => {
    const result = updateCatalog(catalogOf1_4_7(), NO_SOURCES, steamServes({ build8186: 50 }));

    expect(summarize(result)).not.toContain('labelled "Build N"');
  });
});

describe("formatCatalog", () => {
  it("writes the committed catalog exactly as it is", () => {
    const file = readFileSync(path.resolve(import.meta.dirname, "..", "..", "catalog.json"), "utf8");

    expect(formatCatalog(JSON.parse(file))).toBe(file);
  });
});
