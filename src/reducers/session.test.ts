import { describe, expect, it } from "vitest";

import { skyrimSeCatalog } from "../../test/catalogFixtures";
import { reduce } from "../../test/reduce";
import { builtInCatalogLoaded } from "../actions/session";
import { ICatalog } from "../catalog/types";
import { sessionReducer } from "./session";

describe("sessionReducer", () => {
  it("holds the built-in catalog once it has loaded", () => {
    const catalog = skyrimSeCatalog();

    const state = reduce<{ builtInCatalog?: ICatalog }>(sessionReducer, {}, builtInCatalogLoaded(catalog));

    expect(state.builtInCatalog).toEqual(catalog);
  });
});
