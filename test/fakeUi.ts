import type UI from "../src/delegates/UI";
import { type SignInAnswer, SignInMethod } from "../src/types/interface";
import type { IRememberedAccount } from "../src/util/steamAccount";
import { fakeAccounts } from "./fakeAccounts";

export interface IFakeUiOptions {
  /** The files the user selects to restore when shown mismatches. */
  mismatchSelection?: string[];
  credentials?: SignInAnswer;
  /** Whether the user cancels the sign-in prompts. */
  cancelSignIn?: boolean;
  /** The Steam account the extension remembers signing in as. */
  remembered?: IRememberedAccount;
}

/** An extension-side UI that answers the downloader's prompts and records what it was asked. */
export function fakeUi({
  mismatchSelection = ["a.bsa"],
  cancelSignIn = false,
  credentials = { method: SignInMethod.Password, username: "user", password: "pass", remember: true },
  remembered,
}: IFakeUiOptions = {}) {
  const answer =
    <T>(value: T) =>
    async () =>
      cancelSignIn ? undefined : value;
  const mismatches: string[][] = [];
  const signInPrompt: string[] = [];
  const qrCodes: Array<string | undefined> = [];
  const progress: number[] = [];
  const { accounts, signIns, forgottenTokens } = fakeAccounts({ remembered });
  const ui = {
    accounts,
    requestCredentials: answer(credentials),
    requestSteamGuard: answer("GUARD"),
    request2FA: answer("2FA"),
    reportMismatch: async (files: string[]) => {
      mismatches.push(files);
      return mismatchSelection;
    },
    // The user cancels as soon as the prompt shows.
    confirmSignIn: async (qrCode?: string) => {
      signInPrompt.push("shown");
      qrCodes.push(qrCode);
      return true;
    },
    endSignInConfirmation: async () => {
      signInPrompt.push("dismissed");
    },
    reportProgress: async (percent: number) => {
      progress.push(percent);
    },
  } as unknown as UI;
  return {
    ui,
    mismatches,
    signInPrompt,
    qrCodes,
    progress,
    signIns,
    forgottenTokens,
  };
}
