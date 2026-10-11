import { cpSync } from "node:fs";
import { builtinModules, createRequire } from "node:module";
import * as path from "node:path";

import { defineConfig, rolldown } from "rolldown";

const mode = process.env.NODE_ENV === "production" ? "production" : "development";

const extensionPath = path.resolve(import.meta.dirname);
const entryPoint = path.resolve(extensionPath, "src", "index.ts");
const output = path.resolve(extensionPath, "dist", "index.js");

// Resolved at runtime from dist/node_modules, since it loads native binaries by relative path.
const shipped = ["node-api-dotnet"];

// Vortex resolves these from the host process at runtime.
const hostProvided = [
  "electron",
  "vortex-api",
  "@nexusmods/vortex-api",
  "i18next",
  "react",
  "react-bootstrap",
  "react-dom",
  "react-i18next",
  "react-redux",
  "redux-act",
];

// Matches the package and any subpath, e.g. `react/jsx-runtime`.
const external = [
  ...builtinModules.filter((m) => !m.startsWith("_")),
  ...hostProvided,
  ...shipped,
].map((id) => new RegExp(`^${RegExp.escape(id)}(?:$|/)`));

const config = defineConfig({
  input: entryPoint,
  platform: "node",
  // ES module builds first, so unused exports (such as @mdi/js's thousands of icons) are dropped.
  resolve: { mainFields: ["module", "main"] },
  external,
  onLog: (level, log, defaultHandler) => {
    if (log.code === "UNRESOLVED_IMPORT") {
      defaultHandler("error", log);
      return;
    }

    defaultHandler(level, log);
  },
  transform: {
    define: {
      "process.env.NODE_ENV": `"${mode}"`,
    },
  },
  output: {
    file: output,
    format: "cjs",
    dynamicImportInCjs: false,
    minify: mode === "production",
    comments: false,
    sourcemap: true,
  },
});

const bundle = await rolldown(config);
await bundle.write(config.output);

// The package's exports map resolves net9.0 at runtime, so its package.json ships too.
const nodeApiDotnetFiles = ["package.json", "init.js", "net9.0.js", "net9.0", "win-x64"];
const nodeApiDotnetDir = path.dirname(
  createRequire(import.meta.url).resolve("node-api-dotnet/net9.0"),
);
const nodeApiDotnetOut = path.resolve(extensionPath, "dist", "node_modules", "node-api-dotnet");
for (const file of nodeApiDotnetFiles) {
  cpSync(path.join(nodeApiDotnetDir, file), path.join(nodeApiDotnetOut, file), { recursive: true });
}
