import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

import { actions, types, util } from "@nexusmods/vortex-api";

import { workshopItemUrl } from "../constants";
import { IWorkshopMod } from "../types/interface";
import { errorCode, logError } from "./errors";
import { IAccountKeeper } from "./steamAccount";
import { AUTHOR_MODINFO_KEY } from "./workshopAttributes";

/** Records the Workshop item on its download; workshopAttributeExtractor turns it into the mod's attributes. */
export function addDownloadMetaData(
  api: types.IExtensionApi,
  mod: IWorkshopMod,
  downloadId: string,
  gameId: string,
  author: string | undefined,
) {
  const batchedActions = [
    actions.setDownloadModInfo(downloadId, "name", mod.title),
    actions.setDownloadModInfo(downloadId, "source", "website"),
    actions.setDownloadModInfo(downloadId, "url", workshopItemUrl(mod.publishedfileid)),
    actions.setDownloadModInfo(downloadId, "game", gameId),
    actions.setDownloadModInfo(downloadId, "steamkit", JSON.stringify(mod)),
    ...(author !== undefined ? [actions.setDownloadModInfo(downloadId, AUTHOR_MODINFO_KEY, author)] : []),
  ];
  util.batchDispatch(api.store, batchedActions);
}

/** Adds an archive to Vortex's downloads, resolving to the ids it was added under. */
export function importDownload(api: types.IExtensionApi, archivePath: string): Promise<string[]> {
  return new Promise((resolve) =>
    api.events.emit("import-downloads", [archivePath], (downloadIds: string[]) =>
      resolve(downloadIds),
    ),
  );
}

// Where the downloader keeps its config and manifests, inside the directory it downloads to.
const DOWNLOADER_DIR = ".DepotDownloader";

/** Packs what a download left in a directory, without the downloader's own files, into an archive. */
export async function packWorkshopItem(downloadDirectory: string, archivePath: string): Promise<void> {
  const entries = (await readdir(downloadDirectory))
    .filter((entryName) => entryName !== DOWNLOADER_DIR)
    .map((entryName) => path.join(downloadDirectory, entryName));
  await new util.SevenZip().add(archivePath, entries, { raw: ["-r"] });
}

/**
 * Moves the Steam Web API key from its plain-text file into protected state, then deletes the file.
 * Without protection the file stays, and the key is kept for this session only.
 */
export async function migrateWebApiKeyFile(keeper: IAccountKeeper): Promise<void> {
  const file = path.join(util.getVortexPath("temp"), "steamWebAPIKey.json");
  let key: unknown;
  try {
    key = JSON.parse(await readFile(file, "utf8")).key;
  } catch (err) {
    if (errorCode(err) !== "ENOENT") {
      logError("Failed to read the old Steam Web API key file", err);
    }
    return;
  }
  if (typeof key === "string" && key !== "" && (await keeper.webApiKey()) === undefined) {
    await keeper.saveWebApiKey(key);
  }
  if (await keeper.canRemember()) {
    await rm(file, { force: true });
  }
}
