import type { IDepotManifest } from "../../src/catalog/types";
import type { IRawCatalog, IRawVersion } from "./merge";

const depotLine = (depot: IDepotManifest): string =>
  `{ "depotId": ${depot.depotId}, "manifestId": ${JSON.stringify(depot.manifestId)} }`;

// Fields written in this order; any others follow as they come.
const LEADING_FIELDS = ["id", "label", "branch"];

function versionBody(version: IRawVersion): string {
  const fields = [
    ...LEADING_FIELDS.filter((field) => version[field] !== undefined),
    ...Object.keys(version).filter((field) => !LEADING_FIELDS.includes(field) && field !== "depots"),
  ].map((field) => `          ${JSON.stringify(field)}: ${JSON.stringify(version[field])}`);
  const depots =
    version.depots.length === 1
      ? `          "depots": [${depotLine(version.depots[0])}]`
      : [
          '          "depots": [',
          version.depots.map((depot) => `            ${depotLine(depot)}`).join(",\n"),
          "          ]",
        ].join("\n");
  return [...fields, depots].join(",\n");
}

/** The catalog as its file is written: one depot per line, so a diff shows each changed pin. */
export function formatCatalog(catalog: IRawCatalog): string {
  const games = Object.entries(catalog.games).map(([gameId, game]) => {
    const versions = game.versions.map((version) => ["        {", versionBody(version), "        }"].join("\n"));
    return [
      `    ${JSON.stringify(gameId)}: {`,
      `      "steamAppId": ${game.steamAppId},`,
      '      "versions": [',
      versions.join(",\n"),
      "      ]",
      "    }",
    ].join("\n");
  });
  return ["{", `  "schemaVersion": ${catalog.schemaVersion},`, '  "games": {', games.join(",\n"), "  }", "}", ""].join("\n");
}
