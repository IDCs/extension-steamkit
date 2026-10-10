// Writes to the console from a worker thread and the host thread at once, then exits.
// Usage: node console-contention.mjs <dotnet dir> <assembly>...
import { createRequire } from "node:module";
import * as path from "node:path";

const [dotnetDir, ...assemblies] = process.argv.slice(2);
const dotnet = createRequire(import.meta.url)("node-api-dotnet/net9.0");
for (const assembly of assemblies) {
  dotnet.load(path.join(dotnetDir, assembly));
}

const ns = dotnet.DepotDownloaderNative;
ns.NativeApi.SetLogger(() => undefined);
await ns.TestHost.Probes.WriteConsoleFromBothThreads(500);
process.exit(0);
