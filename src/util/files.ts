import { readdir } from "node:fs/promises";
import * as path from "node:path";

import { errorCode } from "./errors";

// Where the downloader keeps its config and manifests, inside the directory it downloads to.
const DOWNLOADER_DIR = ".DepotDownloader";

/** The absolute paths of every file a download left in a directory, without the downloader's own. */
export async function getFiles(basePath: string): Promise<string[]> {
  try {
    const entries = await readdir(basePath, { recursive: true, withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(entry.parentPath, entry.name))
      .filter((filePath) => !path.relative(basePath, filePath).split(path.sep).includes(DOWNLOADER_DIR));
  } catch (err) {
    if (errorCode(err) === "ENOENT") {
      return [];
    }
    throw err;
  }
}
