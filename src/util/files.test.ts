import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getFiles } from "./files";

let root: string;

beforeEach(async () => {
  // realpath resolves Windows 8.3 short names so results compare against the same form.
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "files-test-")));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("getFiles", () => {
  it("lists every file below the directory as absolute paths", async () => {
    await fs.writeFile(path.join(root, "item.gma"), "");
    await fs.mkdir(path.join(root, "maps"));
    await fs.writeFile(path.join(root, "maps", "level.bsp"), "");

    expect((await getFiles(root)).sort()).toEqual(
      [path.join(root, "item.gma"), path.join(root, "maps", "level.bsp")].sort(),
    );
  });

  it("leaves out the downloader's own bookkeeping", async () => {
    await fs.writeFile(path.join(root, "item.gma"), "");
    await fs.mkdir(path.join(root, ".DepotDownloader"));
    await fs.writeFile(path.join(root, ".DepotDownloader", "depot.config"), "");

    expect(await getFiles(root)).toEqual([path.join(root, "item.gma")]);
  });

  it("lists nothing for a directory that does not exist", async () => {
    expect(await getFiles(path.join(root, "missing"))).toEqual([]);
  });
});
