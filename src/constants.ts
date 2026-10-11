export const MODS_PER_PAGE = 50;
export const STEAM_WEB_API_URL = "https://steamcommunity.com/dev/apikey";
/** A Workshop item's Steam page. */
export const workshopItemUrl = (publishedFileId: string): string =>
  `https://steamcommunity.com/sharedfiles/filedetails/?id=${publishedFileId}`;
export const NS = "STEAMKIT";
/** The latest built-in game version catalog; the bundled copy is used when it can't be fetched. */
export const CATALOG_URL =
  "https://raw.githubusercontent.com/Nexus-Mods/extension-steamkit/main/catalog.json";
export const GAME_VERSIONS_DIALOG = "steamkit-game-versions";
export const RESTORE_FILES_DIALOG = "steamkit-restore-files";
