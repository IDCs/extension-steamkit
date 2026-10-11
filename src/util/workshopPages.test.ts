import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryWorkshop, WorkshopSorting } from "./steamWebApi";
import { WorkshopPages } from "./workshopPages";

vi.mock("./steamWebApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./steamWebApi")>()),
  queryWorkshop: vi.fn(async () => ({ items: [], total: 0 })),
}));

const query = (page: number, search = "") => ({ page, search, sorting: WorkshopSorting.ByDate });

describe("WorkshopPages", () => {
  beforeEach(() => {
    vi.mocked(queryWorkshop).mockClear();
  });

  it("asks Steam for a page of the current search once", async () => {
    const pages = new WorkshopPages("key", 294100);

    await pages.page(query(1));
    await pages.page(query(2));
    await pages.page(query(1));

    expect(queryWorkshop).toHaveBeenCalledTimes(2);
  });

  it("asks Steam again for the pages of a search it moved away from", async () => {
    const pages = new WorkshopPages("key", 294100);

    await pages.page(query(1));
    await pages.page(query(1, "food"));
    await pages.page(query(1));

    expect(queryWorkshop).toHaveBeenCalledTimes(3);
  });

  it("asks Steam again for a page that failed", async () => {
    vi.mocked(queryWorkshop).mockRejectedValueOnce(new Error("Steam is down"));
    const pages = new WorkshopPages("key", 294100);

    await expect(pages.page(query(1))).rejects.toThrow("Steam is down");
    await pages.page(query(1));

    expect(queryWorkshop).toHaveBeenCalledTimes(2);
  });

  it("asks Steam again for every page once cleared", async () => {
    const pages = new WorkshopPages("key", 294100);

    await pages.page(query(1));
    pages.clear();
    await pages.page(query(1));

    expect(queryWorkshop).toHaveBeenCalledTimes(2);
  });
});
