// Vortex's renderer runs zone.js (OpenTelemetry's ZoneContextManager), which patches promises.
import "zone.js";

import { beforeAll, describe, expect, it } from "vitest";

import { DOTNET_TEST_DIR, type IProbes, loadProbes } from "../test/dotnet";
import { fakeUi } from "../test/fakeUi";
import { loadBridge, toHostCallbacks, useAssemblyDirectory } from "./native";
import type { IBridge } from "./types/bridge";

let ns: IBridge;
let probes: IProbes;

beforeAll(async () => {
  useAssemblyDirectory(DOTNET_TEST_DIR);
  ns = await loadBridge();
  probes = await loadProbes();
});

describe("toHostCallbacks under zone.js", () => {
  it("runs where then() hands back zone.js promises, as in Vortex", () => {
    const chained = (async () => undefined)().then(() => undefined);

    expect(chained.constructor.name).toBe("ZoneAwarePromise");
  });

  it("answers every downloader callback from the extension's UI", async () => {
    const results = await probes.DriveCallbacks(toHostCallbacks(ns, fakeUi().ui));

    expect(results).toEqual([
      "credentials=user,pass,remember=True",
      "guard=GUARD",
      "twoFactor=2FA",
      "selected=a.bsa",
      "mobileCancelled=True",
    ]);
  });

  it("accepts a promise the UI builds itself, which zone.js makes its own kind", async () => {
    const { ui } = fakeUi();
    ui.reportMismatch = () => new Promise((resolve) => resolve(["b.bsa"]));

    const results = await probes.DriveCallbacks(toHostCallbacks(ns, ui));

    expect(results).toContain("selected=b.bsa");
  });
});
