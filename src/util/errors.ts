import type { types } from "@nexusmods/vortex-api";

import { ErrorKind, SteamkitError } from "../types/errors";

export const ErrorLogLevel = { Debug: "debug", Warn: "warn", Error: "error" } as const;
export type ErrorLogLevel = (typeof ErrorLogLevel)[keyof typeof ErrorLogLevel];
export type ErrorLog = (level: ErrorLogLevel, message: string, metadata?: unknown) => void;

let errorLog: ErrorLog = () => undefined;

/** Sets where logged failures go. */
export function setErrorLog(log: ErrorLog): void {
  errorLog = log;
}

// Node's codes for a host that could not be reached or answered.
const NETWORK_ERROR_CODES = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENETUNREACH",
]);

function isNetworkFailure(err: unknown): boolean {
  if (typeof err !== "object" || err === null) {
    return false;
  }
  const { name, cause } = err as { name?: unknown; cause?: unknown };
  const code = errorCode(err);
  return (
    (code !== undefined && NETWORK_ERROR_CODES.has(code)) ||
    name === "TimeoutError" ||
    isNetworkFailure(cause)
  );
}

/** A Node error's code, such as ENOENT. */
export function errorCode(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

/** Why an operation failed. */
export function classifyError(err: unknown): ErrorKind {
  if (err instanceof SteamkitError) {
    return err.kind;
  }
  return isNetworkFailure(err) ? ErrorKind.SteamUnreachable : ErrorKind.Unexpected;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const LOG_LEVEL: Record<ErrorKind, ErrorLogLevel> = {
  [ErrorKind.Cancelled]: ErrorLogLevel.Debug,
  [ErrorKind.AccessDenied]: ErrorLogLevel.Warn,
  [ErrorKind.SignInFailed]: ErrorLogLevel.Warn,
  [ErrorKind.SteamUnreachable]: ErrorLogLevel.Warn,
  [ErrorKind.Failed]: ErrorLogLevel.Warn,
  [ErrorKind.NotSteamGame]: ErrorLogLevel.Warn,
  [ErrorKind.InvalidInput]: ErrorLogLevel.Warn,
  [ErrorKind.Unexpected]: ErrorLogLevel.Error,
};

/** Logs a failure the user is not told about. */
export function logError(title: string, err: unknown): void {
  errorLog(LOG_LEVEL[classifyError(err)], title, err);
}

function showNotASteamGame(api: types.IExtensionApi): void {
  api.sendNotification({
    type: "warning",
    message: "Must be a game installed by Steam",
    actions: [
      {
        title: "More",
        action: () =>
          api.showDialog(
            "error",
            "Must be a Steam Game",
            {
              text:
                "Verifying game files and installing game versions download from Steam, " +
                "so they only work for games installed via Steam.",
            },
            [{ label: "Close" }],
          ),
      },
    ],
  });
}

/** Tells the user an operation failed, offering a report only for a failure steamkit did not expect. */
export function reportError(api: types.IExtensionApi, title: string, err: unknown): void {
  const kind = classifyError(err);
  switch (kind) {
    case ErrorKind.Cancelled:
      logError(title, err);
      return;
    case ErrorKind.NotSteamGame:
      logError(title, err);
      showNotASteamGame(api);
      return;
    case ErrorKind.Unexpected:
      api.showErrorNotification(title, err, { allowReport: true });
      return;
    case ErrorKind.AccessDenied:
    case ErrorKind.SignInFailed:
    case ErrorKind.SteamUnreachable:
    case ErrorKind.Failed:
    case ErrorKind.InvalidInput:
      api.showErrorNotification(title, errorMessage(err), { allowReport: false });
      return;
  }
  const exhausted: never = kind;
  throw new Error(`unhandled ErrorKind ${exhausted as string}`);
}
