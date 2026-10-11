import { configDefaults, defineConfig } from "vitest/config";

// A local config stops vitest resolving a parent repo's config when checked out nested.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "src/**/*.steam.test.ts"],
    globalSetup: ["test/dotnet.setup.ts"],
    // node-api-dotnet hosts one .NET runtime per process, so test files need their own process.
    pool: "forks",
  },
});
