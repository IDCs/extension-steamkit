import type { types } from "@nexusmods/vortex-api";
import { describe, expect, it } from "vitest";

import { installedWorkshopItemIds } from "./workshopItems";

function mod(id: string, attributes: Record<string, unknown> = {}): types.IMod {
  return { id, state: "installed", type: "", installationPath: id, attributes };
}

describe("installedWorkshopItemIds", () => {
  it("lists the Workshop items the game's mods were installed from", () => {
    const mods = {
      first: mod("first", { publishedfileid: "111" }),
      second: mod("second", { publishedfileid: "222" }),
    };
    expect(installedWorkshopItemIds(mods)).toEqual(new Set(["111", "222"]));
  });

  it("leaves out mods installed from elsewhere", () => {
    const mods = { workshop: mod("workshop", { publishedfileid: "111" }), nexus: mod("nexus", { modId: 5 }) };
    expect(installedWorkshopItemIds(mods)).toEqual(new Set(["111"]));
  });

  it("lists none for a game without mods", () => {
    expect(installedWorkshopItemIds(undefined)).toEqual(new Set());
  });
});
