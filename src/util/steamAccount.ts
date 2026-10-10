import type { types } from "@nexusmods/vortex-api";

import { steamLoginTokenForgotten, steamSignInRecorded, steamWebApiKeySaved } from "../actions/confidential";
import { IConfidentialState } from "../reducers/confidential";

/** Encryption for the current Windows user (DPAPI), through the bridge. */
export interface ISecrets {
  canProtect: boolean;
  protect: (secret: string) => string;
  /** Undefined when it can't be read back, such as another user's secret. */
  unprotect: (protectedSecret: string) => string | undefined;
}

/** The Steam account Vortex remembers signing in as, in plain text for the downloader. */
export interface IRememberedAccount {
  account: string;
  loginToken?: string;
  guardData?: string;
}

/**
 * Keeps the Steam sign-in and Web API key protected in confidential state.
 * Without DPAPI only the key is kept, for this session.
 */
export interface IAccountKeeper {
  canRemember: () => Promise<boolean>;
  remembered: () => Promise<IRememberedAccount | undefined>;
  /** A missing token or Steam Guard record clears the kept one. */
  recordSignIn: (account: string, loginToken?: string, guardData?: string) => Promise<void>;
  forgetLoginToken: () => Promise<void>;
  webApiKey: () => Promise<string | undefined>;
  saveWebApiKey: (webApiKey: string | undefined) => Promise<void>;
}

const confidentialSteam = (state: unknown): IConfidentialState =>
  (state as { confidential?: { account?: { steam?: IConfidentialState } } }).confidential?.account?.steam ?? {};

export function accountKeeper(api: types.IExtensionApi, loadSecrets: () => Promise<ISecrets>): IAccountKeeper {
  let sessionWebApiKey: string | undefined;
  const readBack = (secrets: ISecrets, protectedSecret: string | undefined) =>
    protectedSecret !== undefined ? secrets.unprotect(protectedSecret) : undefined;

  return {
    canRemember: async () => (await loadSecrets()).canProtect,

    remembered: async () => {
      // Nothing kept means nothing to decrypt, so the bridge stays unloaded.
      const kept = confidentialSteam(api.getState());
      if (kept.account === undefined) {
        return undefined;
      }
      const secrets = await loadSecrets();
      const account = secrets.canProtect ? readBack(secrets, kept.account) : undefined;
      if (account === undefined) {
        return undefined;
      }
      const loginToken = readBack(secrets, kept.loginToken);
      const guardData = readBack(secrets, kept.guardData);
      return {
        account,
        ...(loginToken !== undefined ? { loginToken } : {}),
        ...(guardData !== undefined ? { guardData } : {}),
      };
    },

    recordSignIn: async (account, loginToken, guardData) => {
      const secrets = await loadSecrets();
      if (!secrets.canProtect) {
        return;
      }
      api.store.dispatch(
        steamSignInRecorded({
          account: secrets.protect(account),
          ...(loginToken !== undefined ? { loginToken: secrets.protect(loginToken) } : {}),
          ...(guardData !== undefined ? { guardData: secrets.protect(guardData) } : {}),
        }),
      );
    },

    forgetLoginToken: async () => {
      api.store.dispatch(steamLoginTokenForgotten());
    },

    webApiKey: async () => {
      const kept = confidentialSteam(api.getState()).webApiKey;
      if (kept === undefined) {
        return sessionWebApiKey;
      }
      const secrets = await loadSecrets();
      return secrets.canProtect ? secrets.unprotect(kept) : sessionWebApiKey;
    },

    saveWebApiKey: async (webApiKey) => {
      const secrets = await loadSecrets();
      if (!secrets.canProtect) {
        sessionWebApiKey = webApiKey;
        return;
      }
      api.store.dispatch(steamWebApiKeySaved(webApiKey !== undefined ? secrets.protect(webApiKey) : undefined));
    },
  };
}

let shared: IAccountKeeper | undefined;

/** Sets the keeper the extension's jobs and pages use. */
export function shareAccountKeeper(keeper: IAccountKeeper): void {
  shared = keeper;
}

export function sharedAccountKeeper(): IAccountKeeper {
  if (shared === undefined) {
    throw new Error("The Steam account keeper is used before the extension set it up");
  }
  return shared;
}
