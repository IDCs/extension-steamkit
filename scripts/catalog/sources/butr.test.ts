import { describe, expect, it } from "vitest";

import { butrBuild, butrFeed } from "../../../test/catalogUpdateFixtures";
import { butrCandidates } from "./butr";

const labels = (candidates: Array<{ label: string }>) => candidates.map((candidate) => candidate.label);

describe("butrCandidates", () => {
  it("lists the builds pinned branches serve, newest first, without the v of their version", () => {
    const feed = butrFeed({ public: 300, "v1.4.7": 200 }, butrBuild(200, "v1.4.7"), butrBuild(300, "v1.4.8"));

    expect(labels(butrCandidates(feed, false))).toEqual(["1.4.8", "1.4.7"]);
  });

  it("downloads the default branch's build without a branch, and others from the branch serving them", () => {
    const feed = butrFeed({ public: 300, "v1.4.7": 200 }, butrBuild(200, "v1.4.7"), butrBuild(300, "v1.4.8"));

    expect(butrCandidates(feed, false).map((candidate) => candidate.branch)).toEqual([undefined, "v1.4.7"]);
  });

  it("pins the plainest branch of several serving one build", () => {
    const feed = butrFeed(
      { "v1.3.9": 200, "v1.3.9_launcher_opengl_fix": 200 },
      butrBuild(200, "v1.3.9"),
    );

    expect(butrCandidates(feed, false)[0].branch).toBe("v1.3.9");
  });

  it("leaves out builds only a moving branch serves", () => {
    const feed = butrFeed({ public: 300, beta: 400 }, butrBuild(300, "v1.4.8"), butrBuild(400, "v1.5.5"));

    expect(labels(butrCandidates(feed, false))).toEqual(["1.4.8"]);
  });

  it("leaves out builds without a version", () => {
    const feed = butrFeed({ public: 300 }, butrBuild(300, null));

    expect(butrCandidates(feed, false)).toEqual([]);
  });

  it("leaves out builds no branch serves unless history is wanted", () => {
    const feed = butrFeed({ public: 300 }, butrBuild(100, "e1.6.5"), butrBuild(300, "v1.4.8"));

    expect(labels(butrCandidates(feed, false))).toEqual(["1.4.8"]);
    expect(labels(butrCandidates(feed, true))).toEqual(["1.4.8", "e1.6.5"]);
  });

  it("takes the newest build of a version no branch serves, and none of a version one does", () => {
    const feed = butrFeed(
      { public: 300 },
      butrBuild(100, "e1.6.5"),
      butrBuild(150, "e1.6.5"),
      butrBuild(250, "v1.4.8"),
      butrBuild(300, "v1.4.8"),
    );

    expect(butrCandidates(feed, true).map((candidate) => candidate.buildId)).toEqual([300, 150]);
  });

  it("leaves out past builds only a moving branch ever served", () => {
    const feed = butrFeed({ public: 300 }, butrBuild(250, "v1.5.0", { branches: ["beta"] }), butrBuild(300, "v1.4.8"));

    expect(labels(butrCandidates(feed, true))).toEqual(["1.4.8"]);
  });

  it("marks the builds only history knows", () => {
    const feed = butrFeed({ public: 300 }, butrBuild(100, "e1.6.5"), butrBuild(300, "v1.4.8"));

    expect(butrCandidates(feed, true).map((candidate) => candidate.historical)).toEqual([false, true]);
  });
});
