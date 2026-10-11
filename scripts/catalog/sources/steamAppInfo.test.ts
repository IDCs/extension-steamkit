import { describe, expect, it } from "vitest";

import { appInfo, BANNERLORD_DEPOT_IDS } from "../../../test/catalogUpdateFixtures";
import type { ICandidateBuild } from "../candidates";
import { appInfoCandidates, labelOf } from "./steamAppInfo";

const listed = (candidates: ICandidateBuild[]) => candidates.map((candidate) => [candidate.label, candidate.branch]);

describe("appInfoCandidates", () => {
  it("lists each pinned branch's build, labelled by the version its name says", () => {
    const candidates = appInfoCandidates(appInfo({ "v1.4.7": 200, "e1.7.0": 100 }), BANNERLORD_DEPOT_IDS, {});

    expect(listed(candidates)).toEqual([
      ["1.4.7", "v1.4.7"],
      ["e1.7.0", "e1.7.0"],
    ]);
  });

  it("leaves the default branch's build unlabelled, downloaded without a branch", () => {
    const candidates = appInfoCandidates(appInfo({ public: 300 }), BANNERLORD_DEPOT_IDS, {});

    expect(listed(candidates)).toEqual([[undefined, undefined]]);
  });

  it("leaves out moving and password-protected branches", () => {
    const info = appInfo({ public: 300, beta: 400, "v1.4.6": 100 });
    info.branches!["v1.4.6"].passwordRequired = true;

    expect(listed(appInfoCandidates(info, BANNERLORD_DEPOT_IDS, {}))).toEqual([[undefined, undefined]]);
  });

  it("leaves out a branch whose manifests Steam encrypts", () => {
    const info = appInfo({ "v1.4.7": 200 });
    info.depots![String(BANNERLORD_DEPOT_IDS[0])].encryptedManifests = ["v1.4.7"];

    expect(appInfoCandidates(info, BANNERLORD_DEPOT_IDS, {})).toEqual([]);
  });

  it("labels a branch as told when its name doesn't say the version", () => {
    const candidates = appInfoCandidates(appInfo({ legacy: 100 }), BANNERLORD_DEPOT_IDS, { legacy: "Legacy (2022)" });

    expect(listed(candidates)).toEqual([["Legacy (2022)", "legacy"]]);
  });

  it("leaves a branch it can't name unlabelled instead of guessing", () => {
    const candidates = appInfoCandidates(appInfo({ legacy: 100 }), BANNERLORD_DEPOT_IDS, {});

    expect(listed(candidates)).toEqual([[undefined, "legacy"]]);
  });
});

describe("labelOf", () => {
  it.each([
    ["previous_1.2", "1.2"],
    ["version-0.9", "0.9"],
    ["alpha17", "Alpha 17"],
    ["build8186", "Build 8186"],
    ["1.0.65", "1.0.65"],
  ])("labels branch %s as %s", (branchName, label) => {
    expect(labelOf("game", branchName, null)).toBe(label);
  });
});
