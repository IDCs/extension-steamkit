import { RunOutcome } from "./bridge";

/** Why a steamkit operation failed. A run that does not complete fails with its outcome. */
export const ErrorKind = {
  Cancelled: RunOutcome.Cancelled,
  AccessDenied: RunOutcome.AccessDenied,
  SignInFailed: RunOutcome.SignInFailed,
  SteamUnreachable: RunOutcome.SteamUnreachable,
  Failed: RunOutcome.Failed,
  NotSteamGame: "not-steam-game",
  InvalidInput: "invalid-input",
  Unexpected: "unexpected",
} as const;
export type ErrorKind = (typeof ErrorKind)[keyof typeof ErrorKind];

export function isErrorKind(value: string): value is ErrorKind {
  return (Object.values(ErrorKind) as string[]).includes(value);
}

/** A failure steamkit expects, classified by its kind. */
export class SteamkitError extends Error {
  constructor(
    readonly kind: ErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "SteamkitError";
  }
}
