import { createAction } from "redux-act";

import { IGameVersion } from "../catalog/types";

export const userVersionAdded = createAction(
  "STEAMKIT_USER_VERSION_ADDED",
  (gameId: string, version: IGameVersion) => ({ gameId, version }),
);

/** The user edited one of their versions, possibly giving it a new id. */
export const userVersionChanged = createAction(
  "STEAMKIT_USER_VERSION_CHANGED",
  (gameId: string, editedId: string, version: IGameVersion) => ({ gameId, editedId, version }),
);

export const userVersionRemoved = createAction(
  "STEAMKIT_USER_VERSION_REMOVED",
  (gameId: string, versionId: string) => ({ gameId, versionId }),
);
