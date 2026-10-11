import { describe, expect, it } from "vitest";

import { WorkshopSorting, workshopQueryUrl } from "./steamWebApi";

describe("workshopQueryUrl", () => {
  const query = (search: string) => ({ page: 2, search, sorting: WorkshopSorting.ByTrend });

  it("sends the search text as typed, whatever characters it has", () => {
    const url = workshopQueryUrl("key", 233860, query("armour & weapons #2 + 100%"));

    expect(url.searchParams.get("search_text")).toBe("armour & weapons #2 + 100%");
    expect(url.searchParams.get("page")).toBe("2");
  });

  it("leaves the search out when there is none", () => {
    expect(workshopQueryUrl("key", 233860, query("")).searchParams.has("search_text")).toBe(false);
  });

  it("queries the app's items, sorted as asked", () => {
    const url = workshopQueryUrl("key", 233860, query(""));

    expect(url.searchParams.get("appid")).toBe("233860");
    expect(url.searchParams.get("creator_appid")).toBe("233860");
    expect(url.searchParams.get("query_type")).toBe(String(WorkshopSorting.ByTrend));
  });
});
