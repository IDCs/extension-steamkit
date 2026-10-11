// Bundles the catalog update, so its TypeScript imports resolve as in the extension, then runs it.
import { builtinModules } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { rolldown } from "rolldown";

const output = path.resolve(import.meta.dirname, "..", "..", "node_modules", ".cache", "catalog-update", "main.mjs");

const bundle = await rolldown({
  input: path.resolve(import.meta.dirname, "main.ts"),
  platform: "node",
  external: builtinModules.flatMap((name) => [name, `node:${name}`]),
});
await bundle.write({ file: output, format: "esm" });
await bundle.close();

await import(pathToFileURL(output).href);
