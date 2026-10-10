import { describe, expect, it } from "vitest";

import { pageNumbers } from "./vortexUi";

// null marks a gap, shown as "...", as Vortex's own pagination does.
describe("pageNumbers", () => {
  it("lists every page when there are five or fewer", () => {
    expect(pageNumbers(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("lists the first pages and the last near the start", () => {
    expect(pageNumbers(3, 20)).toEqual([1, 2, 3, 4, null, 20]);
  });

  it("lists the first page and the last pages near the end", () => {
    expect(pageNumbers(18, 20)).toEqual([1, null, 17, 18, 19, 20]);
  });

  it("lists the pages around the current one in the middle", () => {
    expect(pageNumbers(10, 20)).toEqual([1, null, 9, 10, 11, null, 20]);
  });
});
