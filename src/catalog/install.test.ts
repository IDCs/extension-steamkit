import { describe, expect, it } from "vitest";

import { gameVersion, SKYRIM_SE_APP_ID } from "../../test/catalogFixtures";
import { versionRunParameters } from "./install";

describe("versionRunParameters", () => {
  it("downloads each depot at its manifest into the game folder", () => {
    expect(
      versionRunParameters(SKYRIM_SE_APP_ID, "D:/Games/Skyrim Special Edition", gameVersion("1.5.97")),
    ).toEqual({
      AppId: SKYRIM_SE_APP_ID,
      InstallDirectory: "D:/Games/Skyrim Special Edition",
      DepotIdList: [489831, 489833],
      ManifestIdList: ["7848722008564294070", "2289561010626853674"],
      VerifyAll: true,
    });
  });

  it("downloads a version kept on a Steam beta branch from that branch", () => {
    const parameters = versionRunParameters(
      413150,
      "D:/Games/Stardew Valley",
      gameVersion("1.6.14", { branch: "previous_version" }),
    );

    expect(parameters.Branch).toBe("previous_version");
  });
});
