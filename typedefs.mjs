// Regenerates src/types/dotnet from the assemblies `pnpm run build:dotnet` publishes.
import { execSync } from "node:child_process";
import { readdirSync } from "node:fs";
import * as path from "node:path";

const published = path.resolve(import.meta.dirname, "dist", "dotnet");
const output = path.resolve(import.meta.dirname, "src", "types", "dotnet");
const assemblies = ["Common", "DepotDownloader", "DepotDownloaderNative"];

const dlls = readdirSync(published).filter((file) => file.endsWith(".dll"));
const quote = (argument) => `"${argument}"`;

for (const assembly of assemblies) {
  const references = dlls
    .filter((dll) => dll !== `${assembly}.dll`)
    .flatMap((dll) => ["-r", quote(path.join(published, dll))]);
  const args = [
    "-a",
    quote(path.join(published, `${assembly}.dll`)),
    "-f",
    "net9.0",
    ...references,
    "-t",
    quote(path.join(output, `${assembly}.d.ts`)),
    "--nowarn",
  ];
  execSync(`pnpm exec node-api-dotnet-generator ${args.join(" ")}`, { stdio: "inherit" });
}
