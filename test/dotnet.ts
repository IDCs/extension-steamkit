import * as path from "node:path";

import { ASSEMBLIES } from "../src/native";
import type { IHostCallbacks, IRunResult } from "../src/types/bridge";

/** Where test setup publishes the bridge and its test host. */
export const DOTNET_TEST_DIR = path.resolve(import.meta.dirname, "..", ".test-dotnet");

/** Probes that drive the bridge without reaching Steam. */
export const TEST_HOST_ASSEMBLY = "DepotDownloaderNative.TestHost.dll";

/** DepotDownloaderNative.TestHost.Probes. */
export interface IProbes {
  DriveCallbacks(host: IHostCallbacks): Promise<string[]>;
  CallFromWorkerThread(callback: () => Promise<string>): Promise<string>;
  WriteConsole(output: string, error: string): void;
  WriteConsoleFromWorkerThread(output: string): Promise<void>;
  WriteConsoleFromBothThreads(lines: number): Promise<void>;
  RunOutcomes(): string[];
  CompletedRun(restoredFiles: string[] | null): IRunResult;
  WaitUntilCancelled(cancellation: AbortSignal): Promise<boolean>;
}

/** The node-api-dotnet module once the test host has loaded. */
interface ITestHostNamespaces {
  DepotDownloaderNative: { TestHost: { Probes: IProbes } };
}

/** Loads the test host's probes. Call after the bridge has loaded. */
export async function loadProbes(): Promise<IProbes> {
  const dotnet = (await import("node-api-dotnet/net9.0")).default;
  dotnet.load(path.join(DOTNET_TEST_DIR, TEST_HOST_ASSEMBLY));
  return (dotnet as unknown as ITestHostNamespaces).DepotDownloaderNative.TestHost.Probes;
}

/** Assemblies the integration tests load, in dependency order. */
export const TEST_ASSEMBLIES = [...ASSEMBLIES, TEST_HOST_ASSEMBLY];
