import { describe, expect, it } from "vitest";

import {
  BANNERLORD_DEPOT_IDS,
  bannerlordManifests,
  candidate,
  rawGame,
  rawVersion,
  WAR_SAILS_DEPOT_ID,
} from "../../test/catalogUpdateFixtures";
import { mergeCandidates, relevantDepots, versionId } from "./merge";

const ids = (game: { versions: Array<{ id: string }> }) => game.versions.map((version) => version.id);

describe("mergeCandidates", () => {
  it("adds the builds the game doesn't list, newest first above its versions", () => {
    const game = rawGame(rawVersion("1.4.7", 100));

    const merged = mergeCandidates(game, BANNERLORD_DEPOT_IDS, [candidate("1.4.8", 200), candidate("1.5.0", 300)]);

    expect(ids(merged.game)).toEqual(["1.5.0", "1.4.8", "1.4.7"]);
  });

  it("places a past build among the listed versions by build, not on top", () => {
    const game = rawGame(rawVersion("1.4.8", 300), rawVersion("1.4.7", 200), rawVersion("e1.7.0", 100));

    const merged = mergeCandidates(game, BANNERLORD_DEPOT_IDS, [
      candidate("1.4.8", 300),
      candidate("1.4.7", 200),
      candidate("e1.8.0", 150, { historical: true }),
      candidate("e1.7.0", 100),
    ]);

    expect(ids(merged.game)).toEqual(["1.4.8", "1.4.7", "e1.8.0", "e1.7.0"]);
  });

  it("puts a past build below the versions whose builds no source names", () => {
    const merged = mergeCandidates(rawGame(rawVersion("1.4.7", 100)), BANNERLORD_DEPOT_IDS, [
      candidate("e1.8.0", 50, { historical: true }),
    ]);

    expect(ids(merged.game)).toEqual(["1.4.7", "e1.8.0"]);
  });

  it("leaves a listed build as it is, whatever a source calls it", () => {
    const game = rawGame(rawVersion("1.4.7", 100));

    const merged = mergeCandidates(game, BANNERLORD_DEPOT_IDS, [candidate("Build 100", 100)]);

    expect(merged.game).toEqual(game);
    expect(merged.added).toEqual([]);
  });

  it("names a build after the first source that offers it", () => {
    const merged = mergeCandidates(rawGame(rawVersion("1.4.7", 100)), BANNERLORD_DEPOT_IDS, [
      candidate("1.4.8", 200, { source: "BUTR" }),
      candidate("Build 200", 200, { source: "Steam" }),
    ]);

    expect(merged.added).toEqual([
      { id: "1.4.8", label: "1.4.8", branch: undefined, buildId: 200, source: "BUTR", unnamed: false },
    ]);
  });

  it("names a default-branch build after a branch serving the same build, downloaded without a branch", () => {
    const merged = mergeCandidates(rawGame(rawVersion("1.4.7", 100)), BANNERLORD_DEPOT_IDS, [
      candidate(undefined, 200),
      candidate("1.4.8", 200, { branch: "v1.4.8" }),
    ]);

    expect(merged.game.versions[0]).toMatchObject({ id: "1.4.8", label: "1.4.8" });
    expect(merged.game.versions[0].branch).toBeUndefined();
  });

  it("labels a default-branch build no source names by its build id", () => {
    const merged = mergeCandidates(rawGame(rawVersion("1.4.7", 100)), BANNERLORD_DEPOT_IDS, [candidate(undefined, 200)]);

    expect(merged.added).toEqual([expect.objectContaining({ label: "Build 200", unnamed: true })]);
  });

  it("pins only the game's depots, leaving out others such as DLC", () => {
    const manifests = { ...bannerlordManifests(200), [String(WAR_SAILS_DEPOT_ID)]: "999" };

    const merged = mergeCandidates(rawGame(rawVersion("1.4.7", 100)), BANNERLORD_DEPOT_IDS, [
      candidate("1.4.8", 200, { manifests }),
    ]);

    expect(merged.game.versions[0].depots.map((depot) => depot.depotId)).toEqual(BANNERLORD_DEPOT_IDS);
  });

  it("turns away a build without a manifest for every depot the game pins", () => {
    const { [String(BANNERLORD_DEPOT_IDS[1])]: _missing, ...manifests } = bannerlordManifests(200);

    const merged = mergeCandidates(rawGame(rawVersion("1.4.7", 100)), BANNERLORD_DEPOT_IDS, [
      candidate("1.4.8", 200, { manifests }),
    ]);

    expect(merged.added).toEqual([]);
    expect(merged.rejected).toHaveLength(1);
  });

  it("passes over a past build from before one of the game's depots existed", () => {
    const { [String(BANNERLORD_DEPOT_IDS[1])]: _missing, ...manifests } = bannerlordManifests(50);

    const merged = mergeCandidates(rawGame(rawVersion("1.4.7", 100)), BANNERLORD_DEPOT_IDS, [
      candidate("e1.6.5", 50, { manifests, historical: true }),
    ]);

    expect(merged.added).toEqual([]);
    expect(merged.rejected).toEqual([]);
  });

  it("asks for a label for a new build no source could name", () => {
    const merged = mergeCandidates(rawGame(rawVersion("1.4.7", 100)), BANNERLORD_DEPOT_IDS, [
      candidate(undefined, 200, { branch: "legacy" }),
    ]);

    expect(merged.added).toEqual([]);
    expect(merged.rejected).toEqual([expect.stringContaining("has no label")]);
  });

  it("needs no label for a build it already lists", () => {
    const merged = mergeCandidates(rawGame(rawVersion("1.4.7", 100)), BANNERLORD_DEPOT_IDS, [
      candidate(undefined, 100, { branch: "legacy" }),
    ]);

    expect(merged.rejected).toEqual([]);
  });

  it("keeps the branch a build is served from", () => {
    const merged = mergeCandidates(rawGame(rawVersion("1.4.7", 100)), BANNERLORD_DEPOT_IDS, [
      candidate("1.4.6", 50, { branch: "v1.4.6" }),
    ]);

    expect(merged.game.versions[0]).toMatchObject({ id: "1.4.6", branch: "v1.4.6" });
  });

  it("gives a build whose label is taken an id of its own", () => {
    const merged = mergeCandidates(rawGame(rawVersion("1.3.7", 100)), BANNERLORD_DEPOT_IDS, [
      candidate("1.3.7", 200),
    ]);

    expect(ids(merged.game)).toEqual(["1.3.7-200", "1.3.7"]);
  });

  it("keeps fields of listed versions it doesn't know", () => {
    const game = rawGame(rawVersion("1.4.7", 100, { notes: "the last 1.4" }));

    const merged = mergeCandidates(game, BANNERLORD_DEPOT_IDS, [candidate("1.4.8", 200)]);

    expect(merged.game.versions[1]).toEqual(game.versions[0]);
  });
});

describe("relevantDepots", () => {
  it("takes the depots of the game's newest version", () => {
    expect(relevantDepots(rawGame(rawVersion("1.4.7", 100)))).toEqual(BANNERLORD_DEPOT_IDS);
  });
});

describe("versionId", () => {
  it("writes a label as the catalog's ids are written", () => {
    expect(versionId("1.3.9 (OpenGL launcher fix)")).toBe("1.3.9-opengl-launcher-fix");
  });
});
