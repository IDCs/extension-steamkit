import type { types } from "@nexusmods/vortex-api";

import { builtInCatalogLoaded, endMismatchDialog, setMismatchState } from "../actions/session";

export const sessionReducer: types.IReducerSpec = {
  reducers: {
    [endMismatchDialog as any]: (state) => ({ ...state, mismatches: [] }),
    [setMismatchState as any]: (state, payload) => ({ ...state, mismatches: payload.mismatches }),
    [builtInCatalogLoaded.getType()]: (state, catalog) => ({ ...state, builtInCatalog: catalog }),
  },
  defaults: { mismatches: [] },
};
