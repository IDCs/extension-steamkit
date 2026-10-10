import type { types } from "@nexusmods/vortex-api";

import { userVersionAdded, userVersionChanged, userVersionRemoved } from "../actions/persistent";
import { IGameVersion } from "../catalog/types";

/** What Vortex keeps for this extension across sessions, under persistent.steamkit. */
export interface IPersistentState {
  // keyed by Vortex game id
  userVersions: Record<string, IGameVersion[]>;
}

const withGameVersions = (
  state: IPersistentState,
  gameId: string,
  update: (versions: IGameVersion[]) => IGameVersion[],
): IPersistentState => ({
  ...state,
  userVersions: { ...state.userVersions, [gameId]: update(state.userVersions[gameId] ?? []) },
});

export const persistentReducer: types.IReducerSpec = {
  reducers: {
    [userVersionAdded.getType()]: (state: IPersistentState, { gameId, version }) =>
      withGameVersions(state, gameId, (versions) => [...versions, version]),
    [userVersionChanged.getType()]: (state: IPersistentState, { gameId, editedId, version }) =>
      withGameVersions(state, gameId, (versions) =>
        versions.map((existing) => (existing.id === editedId ? version : existing)),
      ),
    [userVersionRemoved.getType()]: (state: IPersistentState, { gameId, versionId }) =>
      withGameVersions(state, gameId, (versions) =>
        versions.filter((existing) => existing.id !== versionId),
      ),
  },
  defaults: { userVersions: {} } satisfies IPersistentState,
};
