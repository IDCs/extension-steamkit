import type { types } from "@nexusmods/vortex-api";

/** Applies an action to a reducer's state the way Vortex's reducer builder does. */
export function reduce<State>(
  spec: types.IReducerSpec,
  state: State,
  action: { type: string; payload: unknown },
): State {
  return spec.reducers[action.type](state, action.payload) as State;
}
