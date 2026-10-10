import type { types } from "@nexusmods/vortex-api";
import { describe, expect, it } from "vitest";

import { reduce } from "../../test/reduce";
import { confidentialReducer, IConfidentialState } from "../reducers/confidential";
import { accountKeeper, ISecrets } from "./steamAccount";

/** Stands in for DPAPI: readable back only through this fake. */
const fakeSecrets = (canProtect = true): ISecrets => ({
  canProtect,
  protect: (secret) => `enc:${secret}`,
  unprotect: (protectedSecret) => (protectedSecret.startsWith("enc:") ? protectedSecret.slice(4) : undefined),
});

/** An extension API whose confidential.account.steam state follows the reducer. */
function apiWithState(initial: IConfidentialState = {}) {
  let steam = initial;
  const api = {
    getState: () => ({ confidential: { account: { steam } } }),
    store: {
      dispatch: (action: { type: string; payload: unknown }) => {
        steam = reduce(confidentialReducer, steam, action);
      },
    },
  };
  return { api: api as unknown as types.IExtensionApi, stored: () => steam };
}

describe("accountKeeper", () => {
  it("keeps a sign-in protected, never in plain text", async () => {
    const { api, stored } = apiWithState();

    await accountKeeper(api, async () => fakeSecrets()).recordSignIn("player", "token", "guard");

    expect(stored()).toEqual({ account: "enc:player", loginToken: "enc:token", guardData: "enc:guard" });
  });

  it("hands the downloader the account it remembers", async () => {
    const { api } = apiWithState({ account: "enc:player", loginToken: "enc:token", guardData: "enc:guard" });

    const remembered = await accountKeeper(api, async () => fakeSecrets()).remembered();

    expect(remembered).toEqual({ account: "player", loginToken: "token", guardData: "guard" });
  });

  it("remembers no account it can't read back", async () => {
    const { api } = apiWithState({ account: "another user's", loginToken: "enc:token" });

    expect(await accountKeeper(api, async () => fakeSecrets()).remembered()).toBeUndefined();
  });

  it("drops a token or Steam Guard record it can't read back", async () => {
    const { api } = apiWithState({ account: "enc:player", loginToken: "corrupt", guardData: "enc:guard" });

    expect(await accountKeeper(api, async () => fakeSecrets()).remembered()).toEqual({
      account: "player",
      guardData: "guard",
    });
  });

  it("keeps no token when the user didn't ask to be remembered", async () => {
    const { api, stored } = apiWithState({ account: "enc:player", loginToken: "enc:token" });

    await accountKeeper(api, async () => fakeSecrets()).recordSignIn("player", undefined, "guard");

    expect(stored()).toEqual({ account: "enc:player", guardData: "enc:guard" });
  });

  it("forgets the token Steam rejected", async () => {
    const { api, stored } = apiWithState({ account: "enc:player", loginToken: "enc:token" });

    await accountKeeper(api, async () => fakeSecrets()).forgetLoginToken();

    expect(stored()).toEqual({ account: "enc:player" });
  });

  it("keeps nothing it can't protect", async () => {
    const { api, stored } = apiWithState();
    const keeper = accountKeeper(api, async () => fakeSecrets(false));

    await keeper.recordSignIn("player", "token", "guard");

    expect(await keeper.canRemember()).toBe(false);
    expect(stored()).toEqual({});
  });

  it("keeps the Steam Web API key protected", async () => {
    const { api, stored } = apiWithState();
    const keeper = accountKeeper(api, async () => fakeSecrets());

    await keeper.saveWebApiKey("ABCDEF0123456789");

    expect(stored()).toEqual({ webApiKey: "enc:ABCDEF0123456789" });
    expect(await keeper.webApiKey()).toBe("ABCDEF0123456789");
  });

  it("keeps the Steam Web API key for the session when it can't protect it", async () => {
    const { api, stored } = apiWithState();
    const keeper = accountKeeper(api, async () => fakeSecrets(false));

    await keeper.saveWebApiKey("ABCDEF0123456789");

    expect(stored()).toEqual({});
    expect(await keeper.webApiKey()).toBe("ABCDEF0123456789");
  });
});
