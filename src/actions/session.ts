import { createAction } from "redux-act";

import { ICatalog } from "../catalog/types";

export const builtInCatalogLoaded = createAction(
  "STEAMKIT_BUILT_IN_CATALOG_LOADED",
  (catalog: ICatalog) => catalog,
);

/** The Steam Web API key kept for this session, since it can't be protected; undefined when the user reset it. */
export const sessionWebApiKeySaved = createAction(
  "STEAMKIT_SESSION_WEB_API_KEY_SAVED",
  (webApiKey: string | undefined) => webApiKey,
);
