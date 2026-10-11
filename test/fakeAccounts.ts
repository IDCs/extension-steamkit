import type { IPromptServices } from "../src/delegates/UI";
import { RestorePrompt } from "../src/util/restorePrompt";
import type { IAccountKeeper, IRememberedAccount } from "../src/util/steamAccount";

export interface IFakeAccountsOptions {
  canRemember?: boolean;
  /** The Steam account the extension remembers signing in as. */
  remembered?: IRememberedAccount;
}

/** An account keeper that keeps nothing, recording the sign-ins it is handed and the tokens it forgets. */
export function fakeAccounts({ canRemember = true, remembered }: IFakeAccountsOptions = {}) {
  const signIns: Array<[string, string | undefined, string | undefined]> = [];
  let forgottenTokens = 0;
  const accounts: IAccountKeeper = {
    canRemember: async () => canRemember,
    remembered: async () => remembered,
    recordSignIn: async (account, loginToken, guardData) => {
      signIns.push([account, loginToken, guardData]);
    },
    forgetLoginToken: async () => {
      forgottenTokens++;
    },
    forgetAccount: () => undefined,
    webApiKey: async () => undefined,
    saveWebApiKey: async () => undefined,
  };
  return { accounts, signIns, forgottenTokens: () => forgottenTokens };
}

/** A job's prompt services: a keeper that keeps nothing, and a restore prompt with no dialog behind it. */
export const promptServices = (options: IFakeAccountsOptions = {}): IPromptServices => ({
  accounts: fakeAccounts(options).accounts,
  restorePrompt: new RestorePrompt(() => undefined),
});
