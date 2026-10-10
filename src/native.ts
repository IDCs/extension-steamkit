import * as path from "node:path";

import type UI from "./delegates/UI";
import {
  type IBridge,
  type IHostCallbacks,
  type ILoadedNamespaces,
  type IRunParameters,
  type IRunResult,
  type LogLevel,
  RunOutcome,
} from "./types/bridge";
import { ErrorKind, isErrorKind, SteamkitError } from "./types/errors";
import type { ISecrets } from "./util/steamAccount";
import { type ISteamKitParameters, SignInMethod } from "./types/interface";

// Managed assemblies, in load order: each depends on the ones before it.
export const ASSEMBLIES = ["Common.dll", "DepotDownloader.dll", "DepotDownloaderNative.dll"];

// Parameters passed through unchanged. Unset ones keep the downloader's own defaults.
const PASS_THROUGH = [
  "Username",
  "Password",
  "RememberPassword",
  "ManifestOnly",
  "CellId",
  "FileList",
  "InstallDirectory",
  "VerifyAll",
  "MaxDownloads",
  "LoginId",
  "Branch",
  "BetaBranchPassword",
  "DepotIdList",
  "ManifestIdList",
] as const satisfies ReadonlyArray<keyof ISteamKitParameters & keyof IRunParameters>;

type PassThroughField = (typeof PASS_THROUGH)[number];

export type Logger = (level: LogLevel, message: string) => void;

let logger: Logger = () => undefined;

/** Sets where the downloader's console output is logged. */
export function setLogger(log: Logger): void {
  logger = log;
}

let assemblyDirectory = path.join(__dirname, "dotnet");

/** Loads the bridge's assemblies from another directory. Applies only before the first call into it. */
export function useAssemblyDirectory(directory: string): void {
  assemblyDirectory = directory;
}

let bridge: Promise<IBridge> | undefined;

/** Loads the bridge once. */
export function loadBridge(): Promise<IBridge> {
  bridge ??= (async () => {
    const dotnet = (await import("node-api-dotnet/net9.0")).default;
    for (const assembly of ASSEMBLIES) {
      dotnet.load(path.join(assemblyDirectory, assembly));
    }
    const { Common, DepotDownloader, DepotDownloaderNative } =
      dotnet as unknown as ILoadedNamespaces;
    const { NativeApi } = DepotDownloaderNative;
    NativeApi.LoadDependencies();
    // The downloader logs only at the LogLevel levels.
    NativeApi.SetLogger((level, message) => logger(level as LogLevel, message));
    const { Credentials, HostCallbacks } = Common;
    const { RunParameters } = DepotDownloader;
    return { NativeApi, RunParameters, Credentials, HostCallbacks };
  })();
  return bridge;
}

// Typed by the extension's parameters; passing IRunParameters as the target checks the two agree.
function passThrough<K extends PassThroughField>(
  target: Pick<ISteamKitParameters, PassThroughField>,
  source: ISteamKitParameters,
  field: K,
): void {
  if (source[field] !== undefined) {
    target[field] = source[field];
  }
}

export function toRunParameters(ns: IBridge, parameters: ISteamKitParameters): IRunParameters {
  const native = new ns.RunParameters();
  for (const field of PASS_THROUGH) {
    passThrough(native, parameters, field);
  }
  if (parameters.AppId !== undefined) {
    native.AppId = String(parameters.AppId);
  }
  return native;
}

// Vortex's renderer runs zone.js, whose then() returns a ZoneAwarePromise; node-api-dotnet waits on a
// callback's promise through then() and needs a native promise back.
const nativePromise = Object.getPrototypeOf((async () => undefined)());
const nativeThen: Promise<unknown>["then"] = nativePromise["__zone_symbol__then"] ?? nativePromise.then;

/** A callback whose promises .NET can wait on, whatever kind of promise it returns. */
function forDotnet<Args extends unknown[], T>(
  callback: (...args: Args) => Promise<T>,
): (...args: Args) => Promise<T> {
  return (...args) => {
    const promise = (async () => callback(...args))();
    Object.defineProperty(promise, "then", { value: nativeThen });
    return promise;
  };
}

export function toHostCallbacks(ns: IBridge, ui: UI): IHostCallbacks {
  const host = new ns.HostCallbacks();
  host.requestCredentials = forDotnet(async () => {
    const answer = await ui.requestCredentials();
    const credentials = new ns.Credentials();
    if (answer === undefined) {
      credentials.Cancelled = true;
      return credentials;
    }
    credentials.Remember = answer.remember;
    if (answer.method === SignInMethod.QrCode) {
      credentials.UseQrCode = true;
    } else {
      credentials.Username = answer.username;
      credentials.Password = answer.password;
    }
    return credentials;
  });
  host.requestSteamGuard = forDotnet(ui.requestSteamGuard);
  host.request2FA = forDotnet(ui.request2FA);
  host.reportMismatch = forDotnet(ui.reportMismatch);
  host.confirmSignIn = forDotnet(ui.confirmSignIn);
  host.endSignInConfirmation = forDotnet(ui.endSignInConfirmation);
  host.reportProgress = forDotnet(ui.reportProgress);
  host.recordSignIn = forDotnet(ui.recordSignIn);
  host.forgetLoginToken = forDotnet(ui.forgetLoginToken);
  return host;
}

/** Signs the run in as the account the extension remembers, if any. */
async function withRememberedAccount(native: IRunParameters, ui: UI): Promise<IRunParameters> {
  const remembered = await ui.rememberedAccount();
  if (remembered !== undefined) {
    native.Account = remembered.account;
    native.LoginToken = remembered.loginToken;
    native.GuardData = remembered.guardData;
  }
  return native;
}

/** DPAPI encryption for the current Windows user, through the bridge. */
export async function loadSecrets(): Promise<ISecrets> {
  const { NativeApi } = await loadBridge();
  return {
    canProtect: NativeApi.CanProtect(),
    protect: (secret) => NativeApi.Protect(secret),
    unprotect: (protectedSecret) => NativeApi.Unprotect(protectedSecret) ?? undefined,
  };
}

/** The manifest each installed depot of a Steam app is at, keyed by depot id. */
export async function readInstalledManifests(
  appId: number,
  installDirectory: string,
): Promise<Map<number, string>> {
  const { NativeApi } = await loadBridge();
  return new Map(
    NativeApi.InstalledManifests(installDirectory, appId).map((depot) => [depot.DepotId, depot.ManifestId]),
  );
}

/** Raises a run that did not complete as a steamkit error of its outcome. */
export function requireCompleted(result: IRunResult): void {
  if (result.Outcome === RunOutcome.Completed) {
    return;
  }
  const kind = isErrorKind(result.Outcome) ? result.Outcome : ErrorKind.Unexpected;
  throw new SteamkitError(kind, result.Message);
}

/** Verifies a Steam app's installed files when ManifestOnly is set, else downloads its depots; aborting cancels. */
export async function runDownloader(
  parameters: ISteamKitParameters,
  ui: UI,
  signal?: AbortSignal,
): Promise<void> {
  const ns = await loadBridge();
  const native = await withRememberedAccount(toRunParameters(ns, parameters), ui);
  requireCompleted(await ns.NativeApi.Run(native, toHostCallbacks(ns, ui), signal));
}

/** Downloads a Steam Workshop item into a directory. Aborting the signal ends the run as cancelled. */
export async function downloadWorkshopItem(
  appId: number,
  publishedFileId: string,
  installDirectory: string,
  ui: UI,
  signal?: AbortSignal,
): Promise<void> {
  const ns = await loadBridge();
  const native = await withRememberedAccount(
    toRunParameters(ns, { AppId: appId, InstallDirectory: installDirectory }),
    ui,
  );
  requireCompleted(
    await ns.NativeApi.DownloadWorkshopItem(native, publishedFileId, toHostCallbacks(ns, ui), signal),
  );
}
