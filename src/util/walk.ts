import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface IWalkEntry {
  filePath: string;
  isDirectory: boolean;
}

export interface IWalkOptions {
  recurse?: boolean;
  skipLinks?: boolean;
}

/** Lists the contents of a directory as absolute paths. */
export async function walk(rootPath: string, options: IWalkOptions = {}): Promise<IWalkEntry[]> {
  const { recurse = false, skipLinks = false } = options;

  const entries = await fs.readdir(rootPath, { withFileTypes: true, recursive: recurse });

  return entries
    .filter((entry) => !skipLinks || !entry.isSymbolicLink())
    .map((entry) => ({
      filePath: path.join(entry.parentPath, entry.name),
      isDirectory: entry.isDirectory(),
    }));
}
