import type { types } from "@nexusmods/vortex-api";

import {
  steamAccountForgotten,
  steamLoginTokenForgotten,
  steamSignInRecorded,
  steamWebApiKeySaved,
} from "../actions/confidential";

/** The user's Steam account under confidential.account.steam, each value DPAPI-protected for the Windows user. */
export interface IConfidentialState {
  account?: string;
  loginToken?: string;
  guardData?: string;
  webApiKey?: string;
}

export const confidentialReducer: types.IReducerSpec = {
  reducers: {
    [steamSignInRecorded.getType()]: (state: IConfidentialState, { account, loginToken, guardData }) => ({
      ...(state.webApiKey !== undefined ? { webApiKey: state.webApiKey } : {}),
      account,
      ...(loginToken !== undefined ? { loginToken } : {}),
      ...(guardData !== undefined ? { guardData } : {}),
    }),
    [steamLoginTokenForgotten.getType()]: ({ loginToken: _forgotten, ...state }: IConfidentialState) => state,
    [steamAccountForgotten.getType()]: (state: IConfidentialState) =>
      state.webApiKey !== undefined ? { webApiKey: state.webApiKey } : {},
    [steamWebApiKeySaved.getType()]: ({ webApiKey: _previous, ...state }: IConfidentialState, webApiKey) =>
      webApiKey !== undefined ? { ...state, webApiKey } : state,
  },
  defaults: {} satisfies IConfidentialState,
};
