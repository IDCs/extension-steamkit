import { defineConfig } from "vitest/config";

// Runs against real Steam: needs network access, and each test waits on Steam's servers.
export default defineConfig({
  test: {
    include: ["src/**/*.steam.test.ts"],
    globalSetup: ["test/dotnet.setup.ts"],
    pool: "forks",
    testTimeout: 180_000,
  },
});
