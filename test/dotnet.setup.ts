import { execFileSync } from "node:child_process";

import { DOTNET_TEST_DIR } from "./dotnet";

export function setup(): void {
  execFileSync(
    "dotnet",
    [
      "publish",
      "DepotDownloaderNative.TestHost/DepotDownloaderNative.TestHost.csproj",
      // Debug reuses the build `dotnet test` has just produced.
      "-c",
      "Debug",
      "-o",
      DOTNET_TEST_DIR,
    ],
    { stdio: "inherit" },
  );
}
