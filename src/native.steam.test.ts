import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { setTimeout } from "node:timers/promises";

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { SKYRIM_SE_APP_ID } from "../test/catalogFixtures";
import { DOTNET_TEST_DIR } from "../test/dotnet";
import { fakeUi } from "../test/fakeUi";
import { downloadWorkshopItem, setLogger, runDownloader, useAssemblyDirectory } from "./native";
import { ErrorKind } from "./types/errors";
import { SignInMethod } from "./types/interface";

const CANCELLED = expect.objectContaining({ kind: ErrorKind.Cancelled });

// Steamworks SDK Redist; DepotDownloaderNative.SteamTests covers reporting and restoring its files.
const APP_ID = 1007;
const SMALL_FILE = "tier0_s.dll";

// Skyrim Special Edition, which only an account that owns it can verify.
const SKYRIM_SE_EXE = "SkyrimSE.exe";

let installDirectory: string;

/** Verifies one file of the app in the install directory, answering prompts through the given UI. */
function verifyFile(appId: number, fileName: string, ui: ReturnType<typeof fakeUi>["ui"]) {
  return runDownloader(
    {
      AppId: appId,
      ManifestOnly: true,
      VerifyAll: true,
      InstallDirectory: installDirectory,
      FileList: path.join(installDirectory, fileName),
    },
    ui,
  );
}

/** Verifies Skyrim Special Edition's executable, signing in through the given UI. */
function verifySkyrim(host: ReturnType<typeof fakeUi>) {
  fs.writeFileSync(path.join(installDirectory, SKYRIM_SE_EXE), "overwritten by a mod");
  return verifyFile(SKYRIM_SE_APP_ID, SKYRIM_SE_EXE, host.ui);
}

beforeAll(() => {
  useAssemblyDirectory(DOTNET_TEST_DIR);
});

beforeEach(() => {
  installDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "steamkit-"));
  fs.writeFileSync(path.join(installDirectory, SMALL_FILE), "overwritten by a mod");
});

afterEach(() => {
  setLogger(() => undefined);
  fs.rmSync(installDirectory, { recursive: true, force: true });
});

/** Verifies the small file, answering the mismatch prompt with the given selection. */
function verifySmallFile(mismatchSelection: string[]) {
  return verifyFile(APP_ID, SMALL_FILE, fakeUi({ mismatchSelection }).ui);
}

describe("runDownloader verifying", () => {
  it("keeps the JS thread responsive while it runs", async () => {
    // Loads the bridge first, so only the run itself is measured.
    await verifySmallFile([]);
    const delay = monitorEventLoopDelay({ resolution: 10 });
    delay.enable();
    // The histogram only sees a stall once its timer is running.
    await setTimeout(50);

    await verifySmallFile([]);

    delay.disable();
    expect(delay.max / 1e6).toBeLessThan(250);
  });

  it("logs the downloader output without terminal escape codes", async () => {
    const messages: string[] = [];
    setLogger((_level, message) => messages.push(message));

    await verifySmallFile([SMALL_FILE]);

    expect(messages.join("\n")).toMatch(/Processing depot \d+/);
    expect(messages.join("\n")).not.toContain("\u001b[");
  });

  it("leaves the record of the installed version alone when it restores nothing", async () => {
    await verifySmallFile([]);

    expect(fs.existsSync(path.join(installDirectory, ".DepotDownloader", "depot.config"))).toBe(false);
  });

  it("leaves the files as they are when cancelled before restoring", async () => {
    const controller = new AbortController();
    const { ui } = fakeUi();
    ui.reportMismatch = async () => {
      controller.abort();
      return [SMALL_FILE];
    };

    const verify = runDownloader(
      {
        AppId: APP_ID,
        ManifestOnly: true,
        VerifyAll: true,
        InstallDirectory: installDirectory,
        FileList: path.join(installDirectory, SMALL_FILE),
      },
      ui,
      controller.signal,
    );

    await expect(verify).rejects.toEqual(CANCELLED);
    expect(fs.readFileSync(path.join(installDirectory, SMALL_FILE), "utf8")).toBe(
      "overwritten by a mod",
    );
  });

  it("ends as cancelled when the user cancels signing in", async () => {
    const host = fakeUi({ cancelSignIn: true });

    await expect(verifySkyrim(host)).rejects.toEqual(CANCELLED);
  });

  it("shows a QR code to scan when the user signs in with one", async () => {
    // The fake UI cancels the sign-in prompt as soon as it shows.
    const host = fakeUi({ credentials: { method: SignInMethod.QrCode, remember: false } });

    await expect(verifySkyrim(host)).rejects.toEqual(CANCELLED);

    expect(host.qrCodes).toEqual([expect.stringMatching(/^data:image\/png;base64,/)]);
    expect(host.signInPrompt).toEqual(["shown", "dismissed"]);
  });
});

// Opt-in: a Steam account that owns Skyrim Special Edition, never committed.
const STEAM_USER = process.env.STEAM_TEST_USER;
const STEAM_PASSWORD = process.env.STEAM_TEST_PASSWORD;

describe.skipIf(STEAM_USER === undefined || STEAM_PASSWORD === undefined)(
  "with a Steam account",
  () => {
    it("signs in when asked and verifies an app the account owns", async () => {
      const host = fakeUi({
        mismatchSelection: [],
        credentials: {
          method: SignInMethod.Password,
          username: STEAM_USER!,
          password: STEAM_PASSWORD!,
          remember: false,
        },
      });
      // A wrong code makes Steam ask again, so a code prompt fails the run.
      const noCode = async (): Promise<string> => {
        throw new Error("The test account asked for a Steam Guard code");
      };
      host.ui.requestSteamGuard = noCode;
      host.ui.request2FA = noCode;

      await verifySkyrim(host);

      expect(host.mismatches).toEqual([[SKYRIM_SE_EXE]]);
    });
  },
);

describe("downloadWorkshopItem", () => {
  // Wiremod for Garry's Mod, whose workshop content downloads with an anonymous login.
  const GARRYS_MOD = 4000;
  const WIREMOD = "160250458";

  /** The item's current size as Steam publishes it; the author can update it at any time. */
  async function publishedSize(publishedFileId: string): Promise<number> {
    const response = await fetch(
      "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/",
      {
        method: "POST",
        body: new URLSearchParams({ itemcount: "1", "publishedfileids[0]": publishedFileId }),
      },
    );
    const details = (await response.json()) as {
      response: { publishedfiledetails: [{ file_size: string }] };
    };
    return Number(details.response.publishedfiledetails[0].file_size);
  }

  it("downloads the item into the directory", async () => {
    await downloadWorkshopItem(GARRYS_MOD, WIREMOD, installDirectory, fakeUi().ui);

    expect(fs.statSync(path.join(installDirectory, `${WIREMOD}.gma`)).size).toBe(
      await publishedSize(WIREMOD),
    );
  });

  it("reports its progress as it downloads", async () => {
    const { ui, progress } = fakeUi();

    await downloadWorkshopItem(GARRYS_MOD, WIREMOD, installDirectory, ui);

    expect(progress.length).toBeGreaterThan(1);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    expect(progress.at(-1)).toBe(100);
  });

  it("stops downloading when cancelled", async () => {
    const controller = new AbortController();
    const { ui } = fakeUi();
    ui.reportProgress = async () => controller.abort();

    const download = downloadWorkshopItem(
      GARRYS_MOD,
      WIREMOD,
      installDirectory,
      ui,
      controller.signal,
    );

    await expect(download).rejects.toEqual(CANCELLED);
  });
});
