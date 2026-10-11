import { describe, expect, it } from "vitest";
import * as z from "zod";

import bundledCatalog from "../../catalog.json";
import { gameVersion, SKYRIM_SE_1_5_97_DEPOTS, SKYRIM_SE_APP_ID } from "../../test/catalogFixtures";
import { parseCatalog, parseDepotLines } from "./parse";
import { CATALOG_SCHEMA_VERSION } from "./types";

const SKYRIM_SE_1_5_97 = gameVersion("1.5.97");

const catalogOf = (versions: unknown[], game: Record<string, unknown> = {}) => ({
  schemaVersion: CATALOG_SCHEMA_VERSION,
  games: { skyrimse: { steamAppId: SKYRIM_SE_APP_ID, versions, ...game } },
});

describe("parseCatalog", () => {
  it("validates without compiling code, which Vortex's content security policy forbids", () => {
    expect(z.config().jitless).toBe(true);
  });

  it("reads every game's versions", () => {
    const { catalog, problems } = parseCatalog(catalogOf([SKYRIM_SE_1_5_97]));

    expect(problems).toEqual([]);
    expect(catalog?.["skyrimse"]).toEqual({
      steamAppId: SKYRIM_SE_APP_ID,
      versions: [SKYRIM_SE_1_5_97],
    });
  });

  it("keeps fields it does not know, so later catalogs can add some", () => {
    const { catalog } = parseCatalog(catalogOf([{ ...SKYRIM_SE_1_5_97, notes: "pre-AE" }]));

    expect(catalog?.["skyrimse"].versions[0]).toMatchObject({ notes: "pre-AE" });
  });

  it("keeps the Steam beta branch a version is downloaded from", () => {
    const { catalog } = parseCatalog(catalogOf([{ ...SKYRIM_SE_1_5_97, branch: "previous_version" }]));

    expect(catalog?.["skyrimse"].versions[0].branch).toBe("previous_version");
  });

  it("drops a version whose Steam branch is not a name", () => {
    const { catalog, problems } = parseCatalog(catalogOf([{ ...SKYRIM_SE_1_5_97, branch: 42 }]));

    expect(catalog?.["skyrimse"].versions).toEqual([]);
    expect(problems).toHaveLength(1);
  });

  it("labels a version by its id when it has no label", () => {
    const { label, ...unlabelled } = SKYRIM_SE_1_5_97;

    const { catalog } = parseCatalog(catalogOf([unlabelled]));

    expect(catalog?.["skyrimse"].versions[0].label).toBe(label);
  });

  it("refuses a catalog of another schema version", () => {
    const { catalog, problems } = parseCatalog({ ...catalogOf([]), schemaVersion: 2 });

    expect(catalog).toBeUndefined();
    expect(problems).toEqual([expect.stringContaining("schemaVersion")]);
  });

  it("drops a version whose depots are unusable, and says why", () => {
    // A number, which cannot hold most manifest ids exactly.
    const broken = { id: "1.6.640", depots: [{ depotId: 489831, manifestId: 123456789 }] };

    const { catalog, problems } = parseCatalog(catalogOf([SKYRIM_SE_1_5_97, broken]));

    expect(catalog?.["skyrimse"].versions.map((v) => v.id)).toEqual(["1.5.97"]);
    expect(problems).toEqual([expect.stringContaining("1.6.640")]);
  });

  it("drops a version whose manifest id isn't a number, and says why", () => {
    const broken = { id: "1.6.640", depots: [{ depotId: 489831, manifestId: "not a manifest" }] };

    const { catalog, problems } = parseCatalog(catalogOf([SKYRIM_SE_1_5_97, broken]));

    expect(catalog?.["skyrimse"].versions.map((v) => v.id)).toEqual(["1.5.97"]);
    expect(problems).toEqual([expect.stringContaining("1.6.640")]);
  });

  it("drops a version that repeats another's id", () => {
    const { catalog, problems } = parseCatalog(
      catalogOf([SKYRIM_SE_1_5_97, { ...SKYRIM_SE_1_5_97, label: "copy" }]),
    );

    expect(catalog?.["skyrimse"].versions).toEqual([SKYRIM_SE_1_5_97]);
    expect(problems).toHaveLength(1);
  });

  it("reads the catalog the extension ships in full", () => {
    const { catalog, problems } = parseCatalog(bundledCatalog);

    expect(problems).toEqual([]);
    // Keyed by Vortex game id, not the Nexus domain name ("skyrimspecialedition").
    expect(catalog?.["skyrimse"]?.versions.length).toBeGreaterThan(0);
  });

  it("drops a game without a Steam app id", () => {
    const { catalog, problems } = parseCatalog(catalogOf([SKYRIM_SE_1_5_97], { steamAppId: "x" }));

    expect(catalog).toEqual({});
    expect(problems).toEqual([expect.stringContaining("skyrimse")]);
  });
});

describe("parseDepotLines", () => {
  it("reads a depot and its manifest per line", () => {
    expect(parseDepotLines("489831 7848722008564294070\n489833, 2289561010626853674")).toEqual({
      depots: SKYRIM_SE_1_5_97_DEPOTS,
      problems: [],
    });
  });

  it("reads Steam console download_depot commands as downgrade guides publish them", () => {
    expect(parseDepotLines("download_depot 489830 489831 7848722008564294070", 489830)).toEqual({
      depots: [{ depotId: 489831, manifestId: "7848722008564294070" }],
      problems: [],
    });
  });

  it("refuses a download_depot command for another app", () => {
    const { depots, problems } = parseDepotLines(
      "download_depot 377160 377161 5983086794954940044",
      489830,
    );

    expect(depots).toEqual([]);
    expect(problems).toEqual([expect.stringContaining("377160")]);
  });

  it("refuses a manifest id that does not fit 64 bits", () => {
    const { depots, problems } = parseDepotLines("489831 18446744073709551616");

    expect(depots).toEqual([]);
    expect(problems).toHaveLength(1);
  });

  it("skips blank lines", () => {
    expect(parseDepotLines("\n489831 7848722008564294070\n\n").depots).toHaveLength(1);
  });
});
