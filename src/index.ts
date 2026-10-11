import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";

import { mdiSteam } from "@mdi/js";
import { actions, log, selectors, types, util } from "@nexusmods/vortex-api";

import bundledCatalog from "../catalog.json";
import { builtInCatalogLoaded } from "./actions/session";
import { fetchCatalog, loadBuiltInCatalog } from "./catalog/catalog";
import {
  confirmAndInstallGameVersion,
  gameVersionsWithInstalled,
  installGameVersion,
} from "./catalog/gameVersions";
import { CATALOG_URL, GAME_VERSIONS_DIALOG, RESTORE_FILES_DIALOG, STEAM_WEB_API_URL } from "./constants";
import {
  INSTALL_VERSION_FAILED,
  VERIFY_FAILED,
  VERIFY_FILES_JOB,
  WORKSHOP_DOWNLOAD_FAILED,
  workshopDownloadJob,
} from "./jobs";
import { loadSecrets, runDownloader, setLogger } from "./native";
import { confidentialReducer } from "./reducers/confidential";
import { persistentReducer } from "./reducers/persistent";
import { sessionReducer } from "./reducers/session";
import { offersSteamFeatures, steamAppIdFor } from "./selectors";
import { ErrorKind, SteamkitError } from "./types/errors";
import { ISteamKitParameters, IWorkshopMod, WorkshopAccess, WorkshopAccessState } from "./types/interface";
import { logError, reportError, setErrorLog } from "./util/errors";
import { RestorePrompt } from "./util/restorePrompt";
import { accountKeeper } from "./util/steamAccount";
import { isSteamGame, verifyIsSteamGame, verifyRunParameters, withModsPurged } from "./util/steamGame";
import { runSteamJob } from "./util/steamJob";
import { creatorName } from "./util/steamWebApi";
import { addDownloadMetaData, importDownload, migrateWebApiKeyFile, packWorkshopItem } from "./util/util";
import { workshopArchiveName, workshopAttributeExtractor } from "./util/workshopAttributes";
import { WorkshopPages } from "./util/workshopPages";
import GameVersionsDialog from "./views/GameVersionsDialog";
import RestoreFilesDialog from "./views/RestoreFilesDialog";
import Settings from "./views/Settings";
import WorkshopPage from "./views/WorkshopPage";

function showSteamWebApiDialog(api: types.IExtensionApi) {
  const t = api.translate;
  return api.showDialog(
    "question",
    "Steam Web API Key required",
    {
      bbcode: t(
        "To browse Steam Workshop mods within Vortex, a Steam Web API key is required. " +
          "The API key can be generated at the below link (use any domain name); once generated, paste it into the " +
          "input box.[br][/br][br][/br]" +
          "[url]" +
          `${STEAM_WEB_API_URL}` +
          "[/url][br][/br][br][/br]" +
          "Please note: the API Key is stored confidentially in your application state to avoid " +
          "having to re-type it. You can reset the API key at any point in the " +
          "Settings page.",
      ),
      input: [{ id: "apikey", label: "Steam Web API Key" }],
    },
    [{ label: "Cancel" }, { label: "Confirm" }],
  );
}

// context.once is synchronous, so the icon set is installed fire-and-forget.
function installIcons() {
  util
    .installIconSet("steam", path.join(__dirname, "icons.svg"))
    .catch((err) => logError("Failed to install the steamkit icon set", err));
}

function init(context: types.IExtensionContext): boolean {
  setLogger((level, message) => log(level, "from depot downloader:", message));
  setErrorLog(log);
  context.registerReducer(["session", "steamkit"], sessionReducer);
  context.registerReducer(["persistent", "steamkit"], persistentReducer);
  context.registerReducer(["confidential", "account", "steam"], confidentialReducer);
  context.registerAttributeExtractor(20, workshopAttributeExtractor);
  const accounts = accountKeeper(context.api, loadSecrets);
  const restorePrompt = new RestorePrompt((visible) =>
    context.api.store.dispatch(actions.setDialogVisible(visible ? RESTORE_FILES_DIALOG : undefined)),
  );
  const services = { accounts, restorePrompt };

  /** Hands an API caller the work's result; a failure with a title is also reported to the user. */
  const settle = <T>(
    work: Promise<T>,
    callback: ((err: unknown, result?: T) => void) | undefined,
    failureTitle?: string,
  ) => {
    work.then(
      (result) => callback?.(null, result),
      (err) => {
        if (failureTitle !== undefined) {
          reportError(context.api, failureTitle, err);
        }
        callback?.(err);
      },
    );
  };

  /** Saves the Steam Web API key, or forgets it; resolves to whether that worked. */
  const saveWebApiKey = async (webApiKey: string | undefined): Promise<boolean> => {
    try {
      await accounts.saveWebApiKey(webApiKey);
      return true;
    } catch (err) {
      reportError(context.api, "Failed to save the Steam Web API key", err);
      return false;
    }
  };

  /** Asks for a Steam Web API key and saves it; resolves to whether one was saved. */
  const requestApiKey = async (): Promise<boolean> => {
    const result = await showSteamWebApiDialog(context.api);
    const webApiKey: string | undefined = result.input["apikey"];
    if (result.action !== "Confirm" || webApiKey === undefined || webApiKey === "") {
      return false;
    }
    return saveWebApiKey(webApiKey);
  };

  /** Tells the user how verification ended, given the files they chose to restore, if any differed. */
  const showVerificationResult = (gameId: string, restored: string[] | undefined) => {
    if (restored === undefined) {
      context.api.sendNotification({
        title: "Steam file integrity verification successful",
        message: "Original game files are installed correctly",
        type: "success",
        displayMS: 3000,
      });
    } else if (restored.length === 0) {
      context.api.sendNotification({
        title: "Steam file integrity verification finished",
        message: "Modified game files were left unchanged",
        type: "info",
        displayMS: 3000,
      });
    } else {
      const game = util.getGame(gameId);
      context.api.sendNotification({
        title: "Steam game files successfully restored",
        message: game.name,
        type: "success",
        actions: [
          {
            title: "View",
            action: () =>
              context.api.showDialog(
                "info",
                "Steam game files successfully restored",
                {
                  text: "Steam file integrity service has restored the following original games files:",
                  message: restored.join("\n"),
                },
                [{ label: "Close" }],
              ),
          },
        ],
      });
    }
  };

  /** Verifies the game's files, restoring those the user selects; the caller's parameters override the game's. */
  const verifyFiles = async (gameId: string, overrides?: ISteamKitParameters): Promise<void> => {
    const restored = await runSteamJob(context.api, services, VERIFY_FILES_JOB, async (ui, signal) => {
      const state = context.api.getState();
      const parameters = verifyRunParameters(state, gameId, overrides);
      await verifyIsSteamGame(parameters.AppId, selectors.discoveryByGame(state, gameId));
      return withModsPurged(context.api, gameId, signal, () => runDownloader(parameters, ui, signal));
    });
    showVerificationResult(gameId, restored);
  };

  /** The Workshop creator's Steam name; undefined, so the mod has no author, when Steam doesn't say. */
  const workshopCreatorName = async (creatorSteamId: string): Promise<string | undefined> => {
    try {
      const webApiKey = await accounts.webApiKey();
      return webApiKey !== undefined && webApiKey !== "" ? await creatorName(webApiKey, creatorSteamId) : undefined;
    } catch (err) {
      logError("Failed to look up the Workshop item's creator", err);
      return undefined;
    }
  };

  /** Downloads a Workshop item and adds it to Vortex's downloads. */
  const downloadWorkshopMod = async (mod: IWorkshopMod, gameId: string) => {
    await runSteamJob(context.api, services, workshopDownloadJob(mod.publishedfileid), async (ui, signal) => {
      const authorLookup = workshopCreatorName(mod.creator);
      const stagingDirectory = await mkdtemp(path.join(util.getVortexPath("temp"), "steamkit-"));
      try {
        // A title Windows reserves as a device name, such as "CON", falls back to the item's id.
        const titleName = workshopArchiveName(mod);
        const archiveName = util.isFilenameValid(titleName) ? titleName : mod.publishedfileid;
        const downloadDirectory = path.join(stagingDirectory, archiveName);
        await runDownloader(
          { AppId: mod.creator_appid, InstallDirectory: downloadDirectory, PubFile: mod.publishedfileid },
          ui,
          signal,
        );
        signal.throwIfAborted();
        const archivePath = path.join(stagingDirectory, `${archiveName}.7z`);
        await packWorkshopItem(downloadDirectory, archivePath);
        const downloadIds = await importDownload(context.api, archivePath);
        if (downloadIds.length === 0) {
          throw new SteamkitError(ErrorKind.Failed, `Vortex could not import ${archivePath}`);
        }
        const author = await authorLookup;
        for (const downloadId of downloadIds) {
          addDownloadMetaData(context.api, mod, downloadId, gameId, author);
        }
      } finally {
        await rm(stagingDirectory, { recursive: true, force: true });
      }
    });
    context.api.sendNotification({
      message: "Mod downloaded",
      type: "success",
      displayMS: 3000,
    });
  };

  const steamPage = {
    hotkeyRaw: "F1",
    mdi: mdiSteam,
    visible: () => {
      const state = context.api.getState();
      return offersSteamFeatures(state, selectors.activeGameId(state));
    },
    props: () => ({
      // Never prompts: browsing asks for an API key only when the user chooses to enter one.
      onGameModeActivated: async (gameId: string): Promise<WorkshopAccess> => {
        const state = context.api.getState();
        const steamAppId = steamAppIdFor(state, gameId);
        if (!(await isSteamGame(steamAppId, selectors.discoveryByGame(state, gameId)))) {
          return { state: WorkshopAccessState.NotSteam };
        }
        const webApiKey = await accounts.webApiKey();
        if (webApiKey === undefined || webApiKey === "") {
          return { state: WorkshopAccessState.NeedsApiKey };
        }
        return { state: WorkshopAccessState.Ready, pages: new WorkshopPages(webApiKey, steamAppId) };
      },
      onRequestApiKey: requestApiKey,
      onModClick: (mod: IWorkshopMod) => {
        const gameId = selectors.activeGameId(context.api.getState());
        downloadWorkshopMod(mod, gameId).catch((err) => reportError(context.api, WORKSHOP_DOWNLOAD_FAILED, err));
      },
      onVerifyFiles: () => {
        const gameId = selectors.activeGameId(context.api.getState());
        verifyFiles(gameId).catch((err) => reportError(context.api, VERIFY_FAILED, err));
      },
      onShowGameVersions: () => {
        context.api.store.dispatch(actions.setDialogVisible(GAME_VERSIONS_DIALOG));
      },
    }),
  };
  // A game's own page in the modern layout; a global one in the classic layout.
  context.registerMainPage("steam", "Steam", WorkshopPage, {
    ...steamPage,
    group: "global",
    isClassicOnly: true,
  } as any);
  context.registerMainPage("steam", "Steam", WorkshopPage, {
    ...steamPage,
    id: "game-steam",
    group: "per-game",
    isModernOnly: true,
  } as any);

  context.registerAPI(
    "steamkitVerifyFileIntegrity",
    (parameters: ISteamKitParameters, gameId: string, callback?: (err: unknown) => void) => {
      settle(verifyFiles(gameId, parameters), callback, VERIFY_FAILED);
    },
    { minArguments: 2 },
  );

  context.registerDialog(GAME_VERSIONS_DIALOG, GameVersionsDialog, () => ({
    onInstall: (gameId: string, versionId: string) =>
      confirmAndInstallGameVersion(context.api, services, gameId, versionId),
  }));

  context.registerDialog(RESTORE_FILES_DIALOG, RestoreFilesDialog, () => ({ prompt: restorePrompt }));

  /** The versions of a game the catalog and the user define, built-in first, each with whether it is installed. */
  context.registerAPI(
    "steamkitGetGameVersions",
    (gameId: string, callback: (err: unknown, versions?: Awaited<ReturnType<typeof gameVersionsWithInstalled>>) => void) => {
      settle(gameVersionsWithInstalled(context.api.getState(), gameId), callback);
    },
    { minArguments: 1 },
  );

  /** Puts the game at one of its versions, without asking the user first. */
  context.registerAPI(
    "steamkitInstallGameVersion",
    (gameId: string, versionId: string, callback?: (err: unknown) => void) => {
      settle(installGameVersion(context.api, services, gameId, versionId), callback, INSTALL_VERSION_FAILED);
    },
    { minArguments: 2 },
  );

  context.registerSettings(
    "Interface",
    Settings,
    () => ({
      onRequestApiKey: requestApiKey,
      onResetApiKey: () => saveWebApiKey(undefined),
      getRememberedAccount: async () => (await accounts.remembered())?.account,
      onForgetAccount: accounts.forgetAccount,
    }),
    () => true,
    51,
  );

  context.once(() => {
    installIcons();
    migrateWebApiKeyFile(accounts).catch((err) =>
      logError("Failed to move the Steam Web API key into protected state", err),
    );

    loadBuiltInCatalog(bundledCatalog, () => fetchCatalog(CATALOG_URL))
      .then(({ catalog, problems }) => {
        for (const problem of problems) {
          log("warn", "steamkit game version catalog", problem);
        }
        context.api.store.dispatch(builtInCatalogLoaded(catalog));
      })
      .catch((err) => logError("Failed to load the game version catalog", err));
  });

  return true;
}

export default init;
