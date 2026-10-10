import { readFile, rm } from "node:fs/promises";
import path from "path";

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
  dlId: string,
  gameId: string,
  author: string | undefined,
) {
  const batchedActions = [
    actions.setDownloadModInfo(dlId, "name", mod.title),
    actions.setDownloadModInfo(dlId, "source", "website"),
    actions.setDownloadModInfo(dlId, "url", workshopItemUrl(mod.publishedfileid)),
    actions.setDownloadModInfo(dlId, "game", gameId),
    actions.setDownloadModInfo(dlId, "steamkit", JSON.stringify(mod)),
    ...(author !== undefined ? [actions.setDownloadModInfo(dlId, AUTHOR_MODINFO_KEY, author)] : []),
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

export async function packFiles(modPath: string, files: string[], destination: string) {
  const baseSegments = modPath.split(path.sep);
  const baseSeg = baseSegments.slice(baseSegments.length - 1)[0];
  const arcMap: { [arcName: string]: { basePath: string; relPath: string }[] } = files.reduce(
    (accum, iter) => {
      const segments = iter.split(path.sep);
      const idx = segments.findIndex((seg) => seg === baseSeg);
      if (idx === -1) {
        return accum;
      }
      const modKey = segments.slice(idx - 1, idx + 1).join("_");
      if (accum[modKey] === undefined) {
        accum[modKey] = [];
      }
      const basePath = segments.slice(0, idx + 1).join(path.sep);
      const relPath = path.relative(basePath, iter);
      const pathExists =
        accum[modKey].find(
          (file) => file.relPath.split(path.sep)[0] === relPath.split(path.sep)[0],
        ) !== undefined;
      if (!pathExists) {
        accum[modKey].push({ relPath, basePath });
      }
      return accum;
    },
    {},
  );

  const szip = new util.SevenZip();
  for (const modKey of Object.keys(arcMap)) {
    await szip.add(
      destination,
      arcMap[modKey].map((file) => path.join(file.basePath, file.relPath.split(path.sep)[0])),
      { raw: ["-r"] },
    );
  }
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
