// Updates catalog.json from its sources. Run from the repo root: `pnpm run catalog:update [--summary <file>]`.
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { fetchCatalog } from "../../src/catalog/catalog";
import { errorMessage } from "../../src/util/errors";
import { SourcesConfig } from "./config";
import { formatCatalog } from "./format";
import type { IRawCatalog } from "./merge";
import { butrFeedUrl, IButrFeed } from "./sources/butr";
import type { IAppInfo } from "./sources/steamAppInfo";
import { ISourceData, summarize, updateCatalog } from "./update";

const CATALOG_FILE = "catalog.json";
const SOURCES_FILE = "catalog.sources.json";
const APP_INFO_PROJECT = path.join("tools", "SteamAppInfo", "SteamAppInfo.csproj");

async function readAppInfo(catalog: IRawCatalog): Promise<Record<string, IAppInfo>> {
  const workDirectory = await mkdtemp(path.join(tmpdir(), "steamkit-catalog-"));
  try {
    const appsFile = path.join(workDirectory, "apps.json");
    const outFile = path.join(workDirectory, "appinfo.json");
    const apps = Object.entries(catalog.games).map(([gameId, game]) => ({ gameId, appId: game.steamAppId }));
    await writeFile(appsFile, JSON.stringify(apps));
    execFileSync("dotnet", ["run", "--project", APP_INFO_PROJECT, "-c", "Release", "--", appsFile, outFile], {
      stdio: "inherit",
    });
    const appInfo: IAppInfo[] = JSON.parse(await readFile(outFile, "utf8"));
    return Object.fromEntries(appInfo.map((app) => [app.gameId, app]));
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
}

async function readSources(catalog: IRawCatalog, butrAppIds: number[]): Promise<ISourceData> {
  const data: ISourceData = { appInfo: {}, butrFeeds: {}, failures: [] };
  try {
    data.appInfo = await readAppInfo(catalog);
  } catch (err) {
    data.failures.push(`Steam app info: ${errorMessage(err)}`);
  }
  for (const appId of butrAppIds) {
    try {
      data.butrFeeds[appId] = (await fetchCatalog(butrFeedUrl(appId))) as IButrFeed;
    } catch (err) {
      data.failures.push(`BUTR feed of app ${appId}: ${errorMessage(err)}`);
    }
  }
  return data;
}

async function main(): Promise<void> {
  const summaryIndex = process.argv.indexOf("--summary");
  const summaryFile = summaryIndex >= 0 ? process.argv[summaryIndex + 1] : undefined;

  const catalogText = await readFile(CATALOG_FILE, "utf8");
  const catalog: IRawCatalog = JSON.parse(catalogText);
  const config = SourcesConfig.parse(JSON.parse(await readFile(SOURCES_FILE, "utf8")));
  const butrAppIds = Object.entries(config.games)
    .filter(([gameId, sources]) => sources.butr !== undefined && catalog.games[gameId] !== undefined)
    .map(([gameId]) => catalog.games[gameId].steamAppId);

  const result = updateCatalog(catalog, config, await readSources(catalog, butrAppIds));
  const updatedText = formatCatalog(result.catalog);
  if (updatedText !== catalogText) {
    await writeFile(CATALOG_FILE, updatedText);
  }
  const summary = summarize(result);
  if (summaryFile !== undefined) {
    await writeFile(summaryFile, summary);
  }
  console.log(summary);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
