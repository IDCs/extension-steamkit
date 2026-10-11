import type { types } from "@nexusmods/vortex-api";

import { builtInCatalogLoaded, sessionWebApiKeySaved } from "../actions/session";
import { ICatalog } from "../catalog/types";

export interface ISessionState {
  builtInCatalog?: ICatalog;
  /** The Steam Web API key, in plain text, when it can't be kept protected. */
  webApiKey?: string;
}

export const sessionReducer: types.IReducerSpec = {
  reducers: {
    [builtInCatalogLoaded.getType()]: (state: ISessionState, catalog) => ({ ...state, builtInCatalog: catalog }),
    [sessionWebApiKeySaved.getType()]: ({ webApiKey: _previous, ...state }: ISessionState, webApiKey) =>
      webApiKey !== undefined ? { ...state, webApiKey } : state,
  },
  defaults: {} satisfies ISessionState,
};
