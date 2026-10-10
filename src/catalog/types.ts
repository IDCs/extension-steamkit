import * as z from "zod";

// Vortex's content security policy forbids the code zod would otherwise compile to validate.
z.config({ jitless: true });

/** The catalog format this extension reads. A catalog with another schema version is ignored. */
export const CATALOG_SCHEMA_VERSION = 1;

const MAX_UINT64 = 2n ** 64n - 1n;

const SteamId = z.int().positive();

/** Manifest ids are 64-bit, beyond what a JS number holds exactly, so only decimal strings count. */
const ManifestId = z
  .string()
  .regex(/^\d{1,20}$/, "a manifest id is a decimal string")
  .refine((manifestId) => BigInt(manifestId) <= MAX_UINT64, "a manifest id fits 64 bits");

/** One depot of a version, pinned to a manifest. */
export const DepotManifest = z.object({ depotId: SteamId, manifestId: ManifestId });
export type IDepotManifest = z.infer<typeof DepotManifest>;

/** A game version: the depots Steam downloads to install it. Unknown fields pass through untouched. */
export const GameVersion = z
  .looseObject({
    id: z.string().min(1),
    label: z.string().optional(),
    depots: z.array(DepotManifest).min(1),
    /** The Steam beta branch the version is kept on; Steam only hands out its manifests for that branch. */
    branch: z.string().min(1).optional(),
  })
  .transform((version) => ({
    ...version,
    label: version.label === undefined || version.label === "" ? version.id : version.label,
  }));
export type IGameVersion = z.output<typeof GameVersion>;

/** A game, its versions left unread so each can be accepted or dropped on its own. */
export const GameEntry = z.object({
  steamAppId: SteamId,
  versions: z.array(z.unknown()).default([]),
});

export const CatalogDocument = z.object({
  schemaVersion: z.literal(CATALOG_SCHEMA_VERSION),
  games: z.record(z.string(), z.unknown()).default({}),
});

export interface IGameEntry {
  steamAppId: number;
  versions: IGameVersion[];
}

/** The games of a catalog, keyed by Vortex game id. */
export type ICatalog = Record<string, IGameEntry>;

/** Where a listed version comes from. */
export const VersionSource = { BuiltIn: "builtIn", User: "user" } as const;
export type VersionSource = (typeof VersionSource)[keyof typeof VersionSource];

export interface IListedVersion {
  source: VersionSource;
  version: IGameVersion;
}
