import { afterEach, describe, expect, it, vi } from "vitest";

import { gameVersion, SKYRIM_SE_1_5_97_DEPOTS, skyrimSeCatalog } from "../../test/catalogFixtures";
import {
  fetchCatalog,
  isInstalledVersion,
  listGameVersions,
  loadBuiltInCatalog,
  validateUserVersion,
} from "./catalog";
import { CATALOG_SCHEMA_VERSION, IGameVersion, VersionSource } from "./types";

const documentWith = (...versions: IGameVersion[]) => ({
  schemaVersion: CATALOG_SCHEMA_VERSION,
  games: skyrimSeCatalog(...versions),
});

describe("loadBuiltInCatalog", () => {
  it("uses the remote catalog when it can be read", async () => {
    const loaded = await loadBuiltInCatalog(documentWith(gameVersion("bundled")), async () =>
      documentWith(gameVersion("remote")),
    );

    expect(loaded.catalog).toEqual(skyrimSeCatalog(gameVersion("remote")));
  });

  it("falls back to the bundled catalog when the remote one cannot be fetched", async () => {
    const loaded = await loadBuiltInCatalog(documentWith(gameVersion("bundled")), async () => {
      throw new Error("offline");
    });

    expect(loaded.catalog).toEqual(skyrimSeCatalog(gameVersion("bundled")));
    expect(loaded.problems).toEqual([expect.stringContaining("offline")]);
  });

  it("falls back to the bundled catalog when the remote one is of another schema version", async () => {
    const loaded = await loadBuiltInCatalog(documentWith(gameVersion("bundled")), async () => ({
      ...documentWith(gameVersion("remote")),
      schemaVersion: CATALOG_SCHEMA_VERSION + 1,
    }));

    expect(loaded.catalog).toEqual(skyrimSeCatalog(gameVersion("bundled")));
  });
});

describe("fetchCatalog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the catalog the server sends", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(documentWith(gameVersion("remote")))));

    expect(await fetchCatalog("https://example.com/catalog.json")).toEqual(
      documentWith(gameVersion("remote")),
    );
  });

  it("fails when the server does not send the catalog", async () => {
    vi.stubGlobal("fetch", async () => new Response("Not Found", { status: 404 }));

    await expect(fetchCatalog("https://example.com/catalog.json")).rejects.toThrow("404");
  });
});

describe("listGameVersions", () => {
  it("lists the built-in versions, then the user's", () => {
    const listed = listGameVersions(
      skyrimSeCatalog(gameVersion("1.5.97")),
      { skyrimse: [gameVersion("mine")] },
      "skyrimse",
    );

    expect(listed).toEqual([
      { source: VersionSource.BuiltIn, version: gameVersion("1.5.97") },
      { source: VersionSource.User, version: gameVersion("mine") },
    ]);
  });

  it("lists the user's versions of a game the catalog does not carry", () => {
    expect(listGameVersions(skyrimSeCatalog(), { fallout4: [gameVersion("mine")] }, "fallout4")).toEqual([
      { source: VersionSource.User, version: gameVersion("mine") },
    ]);
  });

  it("leaves out a user version that reuses a built-in id", () => {
    const listed = listGameVersions(
      skyrimSeCatalog(gameVersion("1.5.97")),
      { skyrimse: [gameVersion("1.5.97")] },
      "skyrimse",
    );

    expect(listed.map((entry) => entry.source)).toEqual([VersionSource.BuiltIn]);
  });
});

describe("validateUserVersion", () => {
  const listed = [
    { source: VersionSource.BuiltIn, version: gameVersion("1.5.97") },
    { source: VersionSource.User, version: gameVersion("mine") },
  ];

  it("accepts a new version with depots", () => {
    expect(validateUserVersion(listed, gameVersion("other"))).toEqual([]);
  });

  it("refuses an id a built-in version has", () => {
    expect(validateUserVersion(listed, gameVersion("1.5.97"))).toHaveLength(1);
  });

  it("refuses an id another of the user's versions has", () => {
    expect(validateUserVersion(listed, gameVersion("mine"))).toHaveLength(1);
  });

  it("lets a version being edited keep its own id", () => {
    expect(validateUserVersion(listed, gameVersion("mine"), "mine")).toEqual([]);
  });

  it("refuses a version without an id or depots", () => {
    expect(validateUserVersion(listed, gameVersion("", { depots: [] }))).toHaveLength(2);
  });
});

describe("isInstalledVersion", () => {
  // keyed by depot id
  const installedAt1597 = (): Map<number, string> =>
    new Map(SKYRIM_SE_1_5_97_DEPOTS.map((depot) => [depot.depotId, depot.manifestId]));

  it("matches a version whose every depot is at its manifest", () => {
    expect(isInstalledVersion(gameVersion("1.5.97"), installedAt1597())).toBe(true);
  });

  it("matches while the game has further depots installed, such as DLC", () => {
    const installed = installedAt1597().set(1691140, "1234");

    expect(isInstalledVersion(gameVersion("1.5.97"), installed)).toBe(true);
  });

  it("tells apart a version with a depot at another manifest", () => {
    const installed = installedAt1597().set(489833, "5291801952219815735");

    expect(isInstalledVersion(gameVersion("1.5.97"), installed)).toBe(false);
  });

  it("tells apart a version with a depot the game does not have installed", () => {
    const installed = installedAt1597();
    installed.delete(489833);

    expect(isInstalledVersion(gameVersion("1.5.97"), installed)).toBe(false);
  });
});
