import { describe, expect, it } from "vitest";

import { gameVersion } from "../../test/catalogFixtures";
import { reduce as reduceWith } from "../../test/reduce";
import { userVersionAdded, userVersionChanged, userVersionRemoved } from "../actions/persistent";
import { IPersistentState, persistentReducer } from "./persistent";

const version = (id: string, manifestId = "7848722008564294070") =>
  gameVersion(id, { depots: [{ depotId: 489831, manifestId }] });

const reduce = (state: IPersistentState, action: { type: string; payload: unknown }) =>
  reduceWith(persistentReducer, state, action);

const initial: IPersistentState = persistentReducer.defaults as IPersistentState;

describe("persistentReducer", () => {
  it("starts with no user versions", () => {
    expect(initial).toEqual({ userVersions: {} });
  });

  it("adds a user version to its game", () => {
    const state = reduce(initial, userVersionAdded("skyrimse", version("mine")));

    expect(state.userVersions).toEqual({ skyrimse: [version("mine")] });
  });

  it("keeps the other games' versions when one changes", () => {
    let state = reduce(initial, userVersionAdded("fallout4", version("old")));
    state = reduce(state, userVersionAdded("skyrimse", version("mine")));

    expect(state.userVersions["fallout4"]).toEqual([version("old")]);
  });

  it("replaces an edited version in place, under its new id", () => {
    let state = reduce(initial, userVersionAdded("skyrimse", version("a")));
    state = reduce(state, userVersionAdded("skyrimse", version("b")));

    state = reduce(state, userVersionChanged("skyrimse", "a", version("renamed", "1")));

    expect(state.userVersions["skyrimse"]).toEqual([version("renamed", "1"), version("b")]);
  });

  it("removes a version", () => {
    let state = reduce(initial, userVersionAdded("skyrimse", version("a")));
    state = reduce(state, userVersionAdded("skyrimse", version("b")));

    state = reduce(state, userVersionRemoved("skyrimse", "a"));

    expect(state.userVersions["skyrimse"]).toEqual([version("b")]);
  });
});
