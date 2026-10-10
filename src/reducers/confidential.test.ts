import { describe, expect, it } from "vitest";

import { reduce as reduceWith } from "../../test/reduce";
import {
  steamAccountForgotten,
  steamLoginTokenForgotten,
  steamSignInRecorded,
  steamWebApiKeySaved,
} from "../actions/confidential";
import { confidentialReducer, IConfidentialState } from "./confidential";

const reduce = (state: IConfidentialState, action: { type: string; payload: unknown }) =>
  reduceWith(confidentialReducer, state, action);

const initial = confidentialReducer.defaults as IConfidentialState;

// Every value is protected; these stand in for DPAPI ciphertext.
const signIn = { account: "enc:player", loginToken: "enc:token", guardData: "enc:guard" };

describe("confidentialReducer", () => {
  it("starts with nothing kept", () => {
    expect(initial).toEqual({});
  });

  it("keeps a sign-in", () => {
    expect(reduce(initial, steamSignInRecorded(signIn))).toEqual(signIn);
  });

  it("drops what a later sign-in no longer keeps", () => {
    const state = reduce(reduce(initial, steamSignInRecorded(signIn)), steamSignInRecorded({ account: "enc:player" }));

    expect(state).toEqual({ account: "enc:player" });
  });

  it("forgets only the sign-in token Steam rejected", () => {
    const state = reduce(reduce(initial, steamSignInRecorded(signIn)), steamLoginTokenForgotten());

    expect(state).toEqual({ account: "enc:player", guardData: "enc:guard" });
  });

  it("forgets the account but keeps the Steam Web API key", () => {
    let state = reduce(initial, steamWebApiKeySaved("enc:key"));
    state = reduce(state, steamSignInRecorded(signIn));

    expect(reduce(state, steamAccountForgotten())).toEqual({ webApiKey: "enc:key" });
  });

  it("keeps the Steam Web API key through a sign-in", () => {
    const state = reduce(reduce(initial, steamWebApiKeySaved("enc:key")), steamSignInRecorded(signIn));

    expect(state).toEqual({ ...signIn, webApiKey: "enc:key" });
  });

  it("forgets the Steam Web API key", () => {
    const state = reduce(reduce(initial, steamWebApiKeySaved("enc:key")), steamWebApiKeySaved(undefined));

    expect(state).toEqual({});
  });
});
