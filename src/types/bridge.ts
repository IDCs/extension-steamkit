// The bridge's .NET API as node-api-dotnet presents it to JS; `pnpm run typedefs` regenerates ./dotnet.
import type * as dotnet from "node-api-dotnet";
import type { Common, DepotDownloader, DepotDownloaderNative } from "node-api-dotnet";

/** Levels the downloader logs its console output at. */
export const LogLevel = { Debug: "debug", Error: "error" } as const;
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

/** How a downloader run ended: DepotDownloader.RunOutcome. */
export const RunOutcome = {
  Completed: "completed",
  Cancelled: "cancelled",
  AccessDenied: "access-denied",
  SignInFailed: "sign-in-failed",
  SteamUnreachable: "steam-unreachable",
  Failed: "failed",
} as const;
export type RunOutcome = (typeof RunOutcome)[keyof typeof RunOutcome];

export type IRunParameters = DepotDownloader.RunParameters;
export type IRunResult = Pick<DepotDownloader.RunResult, "Outcome" | "Message" | "FilesDiffered" | "RestoredFiles">;
export type IHostCallbacks = Common.HostCallbacks;

/** The types the extension uses. */
export interface IBridge {
  NativeApi: typeof DepotDownloaderNative.NativeApi;
  RunParameters: typeof DepotDownloader.RunParameters;
  Credentials: typeof Common.Credentials;
  HostCallbacks: typeof Common.HostCallbacks;
}

/** The node-api-dotnet module once the bridge's assemblies are loaded: types merge in by .NET namespace. */
export type ILoadedNamespaces = Pick<typeof dotnet, "Common" | "DepotDownloader" | "DepotDownloaderNative">;
