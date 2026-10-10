import { describe, expect, it } from "vitest";

import { totalVotes } from "./votes";

describe("totalVotes", () => {
  it("sums up and down votes", () => {
    expect(totalVotes({ score: 0.7, votes_up: 30, votes_down: 12 })).toBe(42);
  });

  it("counts a missing side as zero", () => {
    expect(totalVotes({ votes_up: 7 })).toBe(7);
    expect(totalVotes({ votes_down: 5 })).toBe(5);
  });

  it("is zero without vote data", () => {
    expect(totalVotes(undefined)).toBe(0);
  });
});
