import { createAction } from "redux-act";

import { ICatalog } from "../catalog/types";
import { IMismatchState } from "../types/interface";

export const builtInCatalogLoaded = createAction(
  "STEAMKIT_BUILT_IN_CATALOG_LOADED",
  (catalog: ICatalog) => catalog,
);

export const endMismatchDialog = createAction("END_MISMATCH_DIALOG");

export const setMismatchState = createAction(
  "SET_MISMATCH_DIALOG_STATE",
  (state: IMismatchState): any => state,
);
