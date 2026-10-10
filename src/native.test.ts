import { spawnSync } from "node:child_process";
import * as path from "node:path";

import { beforeAll, describe, expect, it, vi } from "vitest";

import { DOTNET_TEST_DIR, type IProbes, loadProbes, TEST_ASSEMBLIES } from "../test/dotnet";
import { fakeUi } from "../test/fakeUi";
import {
  loadBridge,
  requireCompleted,
  runDownloader,
  toHostCallbacks,
  toRunParameters,
  useAssemblyDirectory,
} from "./native";
import { type IBridge, RunOutcome } from "./types/bridge";
import { ErrorKind, SteamkitError } from "./types/errors";

let ns: IBridge;
let probes: IProbes;

beforeAll(async () => {
  useAssemblyDirectory(DOTNET_TEST_DIR);
  ns = await loadBridge();
  probes = await loadProbes();
});

describe("toHostCallbacks", () => {
  it("answers every downloader callback from the extension's UI", async () => {
    const { ui } = fakeUi();

    const results = await probes.DriveCallbacks(toHostCallbacks(ns, ui));

    expect(results).toEqual([
      "credentials=user,pass,remember=True",
      "guard=GUARD",
      "twoFactor=2FA",
      "selected=a.bsa",
      "mobileCancelled=True",
    ]);
  });

  it("answers a sign-in prompt the user cancels with no answer", async () => {
    const results = await probes.DriveCallbacks(
      toHostCallbacks(ns, fakeUi({ cancelSignIn: true }).ui),
    );

    expect(results).toEqual(
      expect.arrayContaining([
        "credentials=(cancelled)",
        "guard=(cancelled)",
        "twoFactor=(cancelled)",
      ]),
    );
  });

  it("passes mismatched files to the extension", async () => {
    const { ui, mismatches } = fakeUi();

    await probes.DriveCallbacks(toHostCallbacks(ns, ui));

    expect(mismatches).toEqual([["a.bsa", "b.bsa"]]);
  });

  it("shows and dismisses the Steam Mobile approval prompt", async () => {
    const { ui, signInPrompt, qrCodes } = fakeUi();

    await probes.DriveCallbacks(toHostCallbacks(ns, ui));

    expect(signInPrompt).toEqual(["shown", "dismissed"]);
    expect(qrCodes).toEqual([undefined]);
  });

  it("hands the extension the sign-ins to keep and the tokens to forget", async () => {
    const { ui, signIns, forgottenTokens } = fakeUi();

    await probes.DriveCallbacks(toHostCallbacks(ns, ui));

    expect(signIns).toEqual([["player", "token", undefined]]);
    expect(forgottenTokens).toEqual(["player"]);
  });

  it("passes download progress to the extension", async () => {
    const { ui, progress } = fakeUi();

    await probes.DriveCallbacks(toHostCallbacks(ns, ui));

    expect(progress).toEqual([42]);
  });

  it("passes the files the user selects to restore", async () => {
    const results = await probes.DriveCallbacks(
      toHostCallbacks(ns, fakeUi({ mismatchSelection: ["a.bsa", "b.bsa"] }).ui),
    );

    expect(results).toContain("selected=a.bsa,b.bsa");
  });

  it("answers callbacks the downloader makes from a worker thread", async () => {
    expect(await probes.CallFromWorkerThread(async () => "answered")).toBe("answered");
  });
});

describe("toRunParameters", () => {
  it("passes the app id as a string", () => {
    const parameters = toRunParameters(ns, { AppId: 489830 });

    expect(parameters.AppId).toBe("489830");
  });

  it("carries the fields the extension sets", () => {
    const parameters = toRunParameters(ns, {
      VerifyAll: true,
      InstallDirectory: "C:/Games/Skyrim",
    });

    expect(parameters.VerifyAll).toBe(true);
    expect(parameters.InstallDirectory).toBe("C:/Games/Skyrim");
  });

  it("carries the depots and manifests to verify", () => {
    const parameters = toRunParameters(ns, {
      DepotIdList: [489833],
      ManifestIdList: ["123456789"],
    });

    expect(parameters.DepotIdList).toEqual([489833]);
    expect(parameters.ManifestIdList).toEqual(["123456789"]);
  });

  it("carries manifest ids beyond the integers JavaScript can hold exactly", () => {
    const parameters = toRunParameters(ns, {
      DepotIdList: [489831],
      ManifestIdList: ["7848722008564294070"],
    });

    expect(parameters.ManifestIdList).toEqual(["7848722008564294070"]);
  });

  it("uses the downloader defaults for fields it leaves unset", () => {
    const parameters = toRunParameters(ns, {});

    // node-api-dotnet reads a .NET null string back as undefined.
    expect(parameters.FileList).toBeUndefined();
    expect(parameters.MaxDownloads).toBe(8);
    expect(parameters.CellId).toBe(0);
  });
});

describe("NativeApi.SetLogger", () => {
  /** Captures logged lines, splitting the batches the logger delivers. */
  function captureLog(): Array<[string, string]> {
    const lines: Array<[string, string]> = [];
    ns.NativeApi.SetLogger((level: string, message: string) => {
      for (const line of message.split("\n")) {
        lines.push([level, line]);
      }
    });
    return lines;
  }

  it("logs console output and errors at their levels", async () => {
    const lines = captureLog();

    probes.WriteConsole("Connecting to Steam3...", "Timeout connecting to Steam3.");

    await vi.waitFor(() =>
      expect(lines).toEqual(
        expect.arrayContaining([
          ["debug", "Connecting to Steam3..."],
          ["error", "Timeout connecting to Steam3."],
        ]),
      ),
    );
  });

  it("keeps logging while the host thread writes too", () => {
    // A deadlock would stall the host thread, so it runs in its own process with a deadline.
    const script = path.resolve(import.meta.dirname, "..", "test", "console-contention.mjs");
    const result = spawnSync(process.execPath, [script, DOTNET_TEST_DIR, ...TEST_ASSEMBLIES], {
      timeout: 30_000,
    });

    expect(result.signal).toBeNull();
    expect(result.status).toBe(0);
  }, 40_000);

  it("logs output written from a worker thread", async () => {
    const lines = captureLog();

    await probes.WriteConsoleFromWorkerThread("Downloading depot 489831");

    await vi.waitFor(() => expect(lines).toContainEqual(["debug", "Downloading depot 489831"]));
  });
});

describe("cancelling a run", () => {
  it("passes an abort from the extension to the run", async () => {
    const controller = new AbortController();
    const waiting = probes.WaitUntilCancelled(controller.signal);

    controller.abort();

    expect(await waiting).toBe(true);
  });

  it("ends a run aborted before its turn as cancelled", async () => {
    const controller = new AbortController();
    controller.abort();

    const run = runDownloader(
      { AppId: 1007, ManifestOnly: true, InstallDirectory: DOTNET_TEST_DIR },
      fakeUi().ui,
      controller.signal,
    );

    await expect(run).rejects.toEqual(expect.objectContaining({ kind: ErrorKind.Cancelled }));
  });
});

describe("RunOutcome", () => {
  it("lists every code the bridge ends a run with", () => {
    expect(probes.RunOutcomes().sort()).toEqual(Object.values(RunOutcome).sort());
  });
});

describe("requireCompleted", () => {
  it("accepts a completed run", () => {
    expect(() => requireCompleted({ Outcome: RunOutcome.Completed, Message: "" })).not.toThrow();
  });

  it.each([
    [RunOutcome.Cancelled, ErrorKind.Cancelled],
    [RunOutcome.AccessDenied, ErrorKind.AccessDenied],
    [RunOutcome.SignInFailed, ErrorKind.SignInFailed],
    [RunOutcome.SteamUnreachable, ErrorKind.SteamUnreachable],
    [RunOutcome.Failed, ErrorKind.Failed],
  ])("raises a run that ended %s as a %s error with the downloader's message", (outcome, kind) => {
    const run = () => requireCompleted({ Outcome: outcome, Message: "App 489830 is not available" });

    expect(run).toThrow(new SteamkitError(kind, "App 489830 is not available"));
    expect(run).toThrow(expect.objectContaining({ kind }));
  });

  it("raises an outcome it does not know as unexpected", () => {
    expect(() => requireCompleted({ Outcome: "exploded", Message: "" })).toThrow(
      expect.objectContaining({ kind: ErrorKind.Unexpected }),
    );
  });
});
