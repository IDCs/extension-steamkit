import { builtinModules } from "node:module";
import * as path from "node:path";

import { defineConfig, rolldown } from "rolldown";

const mode = process.env.NODE_ENV === "production" ? "production" : "development";

const extensionPath = path.resolve(import.meta.dirname);
const entryPoint = path.resolve(extensionPath, "src", "index.ts");
const output = path.resolve(extensionPath, "dist", "index.js");

// Vortex resolves these from the host process at runtime.
const hostProvided = [
  "electron",
  "vortex-api",
  "@nexusmods/vortex-api",
  "bluebird",
  "i18next",
  "lodash",
  "minimatch",
  "react",
  "react-bootstrap",
  "react-dom",
  "react-i18next",
  "react-redux",
  "react-select",
  "redux-act",
  "shortid",
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Matches the package and any subpath, e.g. `react/jsx-runtime`.
const external = [...builtinModules.filter((m) => !m.startsWith("_")), ...hostProvided].map(
  (id) => new RegExp(`^${escapeRegExp(id)}(?:$|/)`),
);

const config = defineConfig({
  input: entryPoint,
  platform: "node",
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
