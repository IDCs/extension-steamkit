import { createAction } from "redux-act";

/** Protected values of a sign-in Steam accepted; a missing one is cleared. */
export interface IProtectedSignIn {
  account: string;
  loginToken?: string;
  guardData?: string;
}

export const steamSignInRecorded = createAction(
  "STEAMKIT_STEAM_SIGN_IN_RECORDED",
  (signIn: IProtectedSignIn) => signIn,
);

/** Steam rejected the kept sign-in token: it expired or the user revoked it. */
export const steamLoginTokenForgotten = createAction("STEAMKIT_STEAM_LOGIN_TOKEN_FORGOTTEN");

/** The user asked Vortex to forget their Steam account. */
export const steamAccountForgotten = createAction("STEAMKIT_STEAM_ACCOUNT_FORGOTTEN");

/** The protected Steam Web API key; undefined when the user reset it. */
export const steamWebApiKeySaved = createAction(
  "STEAMKIT_STEAM_WEB_API_KEY_SAVED",
  (webApiKey: string | undefined) => webApiKey,
);
