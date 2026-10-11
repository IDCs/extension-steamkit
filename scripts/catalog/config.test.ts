import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SourcesConfig } from "./config";

describe("SourcesConfig", () => {
  it("reads the committed sources", () => {
    const file = path.resolve(import.meta.dirname, "..", "..", "catalog.sources.json");

    expect(SourcesConfig.safeParse(JSON.parse(readFileSync(file, "utf8"))).success).toBe(true);
  });

  it("refuses a label for the default branch, which moves on to other builds", () => {
    const config = { games: { kenshi: { labels: { public: "1.0.65" } } } };

    expect(SourcesConfig.safeParse(config).success).toBe(false);
  });
});
