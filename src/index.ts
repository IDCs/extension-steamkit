import * as path from "path";

import { mdiSteam } from "@mdi/js";
import { actions, fs, log, selectors, types, util } from "@nexusmods/vortex-api";

import bundledCatalog from "../catalog.json";
import { steamAccountForgotten } from "./actions/confidential";
import { builtInCatalogLoaded, endMismatchDialog } from "./actions/session";
import { fetchCatalog, loadBuiltInCatalog } from "./catalog/catalog";
import {
  confirmAndInstallGameVersion,
  gameVersions,
  installGameVersion,
} from "./catalog/gameVersions";
import { IListedVersion } from "./catalog/types";
import { CATALOG_URL, GAME_VERSIONS_DIALOG, STEAM_WEB_API_URL } from "./constants";
import {
  INSTALL_VERSION_FAILED,
  VERIFY_FAILED,
  VERIFY_FILES_JOB,
  WORKSHOP_DOWNLOAD_FAILED,
  workshopDownloadJob,
} from "./jobs";
import { downloadWorkshopItem, loadSecrets, runDownloader, setLogger } from "./native";
import { confidentialReducer } from "./reducers/confidential";
import { persistentReducer } from "./reducers/persistent";
import { sessionReducer } from "./reducers/session";
import { offersSteamFeatures, steamAppIdFor } from "./selectors";
import { ErrorKind, SteamkitError } from "./types/errors";
import {
  IMismatch,
  ISteamKitParameters,
  IWorkshopMod,
  WorkshopAccess,
  WorkshopAccessState,
} from "./types/interface";
import { logError, reportError, setErrorLog } from "./util/errors";
import { getFiles } from "./util/files";
import { ModScrubber } from "./util/Scrubber";
import { isSteamGame, verifyIsSteamGame, withModsPurged } from "./util/steamGame";
import { accountKeeper, shareAccountKeeper } from "./util/steamAccount";
import { runSteamJob } from "./util/steamJob";
import { addDownloadMetaData, importDownload, migrateWebApiKeyFile, packFiles } from "./util/util";
import { workshopAttributeExtractor } from "./util/workshopAttributes";
import GameVersionsDialog from "./views/GameVersionsDialog";
import MismatchDialog from "./views/MismatchDialog";
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
  shareAccountKeeper(accounts);

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
  let downloadQueue;
  let modScrubber: ModScrubber;

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

  const verifyFiles = async (parameters: ISteamKitParameters, gameId: string): Promise<void> => {
    const restored = await runSteamJob(context.api, VERIFY_FILES_JOB, async (ui, signal) => {
      const discovery = selectors.discoveryByGame(context.api.getState(), gameId);
      await verifyIsSteamGame(parameters.AppId, discovery);
      await withModsPurged(context.api, gameId, signal, () => runDownloader(parameters, ui, signal));
      return ui.restoreSelection;
    });
    showVerificationResult(gameId, restored);
  };

  /** The Workshop creator's Steam name; undefined, so the mod has no author, when Steam doesn't say. */
  const workshopCreatorName = (creatorSteamId: string): Promise<string | undefined> =>
    modScrubber.creatorName(creatorSteamId).catch((err) => {
      logError("Failed to look up the Workshop item's creator", err);
      return undefined;
    });

  /** Downloads a workshop item and adds it to Vortex's downloads. */
  const downloadWorkshopMod = async (mod: IWorkshopMod, gameId: string) => {
    await runSteamJob(context.api, workshopDownloadJob(mod.publishedfileid), async (ui, signal) => {
      const authorLookup = workshopCreatorName(mod.creator);
      const modPath = path.join(
        util.getVortexPath("temp"),
        gameId,
        mod.title.replace(/[^a-zA-Z0-9.]/gm, ""),
      );
      await fs.ensureDirWritableAsync(modPath);
      await downloadWorkshopItem(mod.creator_appid, mod.publishedfileid, modPath, ui, signal);
      signal.throwIfAborted();
      const archivePath = `${modPath}.7z`;
      await packFiles(modPath, await getFiles(modPath), archivePath);
      const downloadIds = await importDownload(context.api, archivePath);
      if (downloadIds.length === 0) {
        throw new SteamkitError(ErrorKind.Failed, `Vortex could not import ${archivePath}`);
      }
      const author = await authorLookup;
      for (const downloadId of downloadIds) {
        addDownloadMetaData(context.api, mod, downloadId, gameId, author);
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
        modScrubber.init(String(steamAppId), webApiKey);
        return { state: WorkshopAccessState.Ready, scrubber: modScrubber };
      },
      onRequestApiKey: requestApiKey,
      onModClick: (mod: IWorkshopMod) => {
        const gameMode = selectors.activeGameId(context.api.getState());
        downloadQueue(() =>
          downloadWorkshopMod(mod, gameMode).catch((err) =>
            reportError(context.api, WORKSHOP_DOWNLOAD_FAILED, err),
          ),
        );
      },
      onVerifyFiles: () => {
        const state = context.api.getState();
        const gameMode = selectors.activeGameId(state);
        const parameters: ISteamKitParameters = {
          AppId: steamAppIdFor(state, gameMode),
          VerifyAll: true,
          ManifestOnly: true,
          InstallDirectory: selectors.discoveryByGame(state, gameMode).path,
        };
        verifyFiles(parameters, gameMode).catch((err) => reportError(context.api, VERIFY_FAILED, err));
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
      verifyFiles(parameters, gameId).then(
        () => callback?.(null),
        (err) => {
          reportError(context.api, VERIFY_FAILED, err);
          callback?.(err);
        },
      );
    },
    { minArguments: 2 },
  );

  context.registerDialog(GAME_VERSIONS_DIALOG, GameVersionsDialog, () => ({
    onInstall: (gameId: string, versionId: string) =>
      confirmAndInstallGameVersion(context.api, gameId, versionId),
  }));

  /** The versions of a game the catalog and the user define, built-in first. */
  context.registerAPI(
    "steamkitGetGameVersions",
    (gameId: string, callback: (err: Error | null, versions?: IListedVersion[]) => void) => {
      callback(null, gameVersions(context.api, gameId));
    },
    { minArguments: 1 },
  );

  /** Puts the game at one of its versions, without asking the user first. */
  context.registerAPI(
    "steamkitInstallGameVersion",
    (gameId: string, versionId: string, callback: (err: Error | null) => void) => {
      installGameVersion(context.api, gameId, versionId).then(
        () => callback(null),
        (err) => {
          reportError(context.api, INSTALL_VERSION_FAILED, err);
          callback(err);
        },
      );
    },
    { minArguments: 2 },
  );

  context.registerSettings(
    "Interface",
    Settings,
    () => ({
      t: context.api.translate,
      getSteamWebApiKey: () => accounts.webApiKey(),
      onRequestApiKey: requestApiKey,
      onResetApiKey: () => saveWebApiKey(undefined),
      getRememberedAccount: async () => (await accounts.remembered())?.account,
      onForgetAccount: () => context.api.store.dispatch(steamAccountForgotten()),
    }),
    () => true,
    51,
  );

  context.registerDialog("mismatched-files-dialog", MismatchDialog, () => ({
    onSelect: (mismatches: IMismatch[]) => {
      context.api.store.dispatch(endMismatchDialog());
      context.api.events.emit("steamkit-mismatch-select", mismatches);
    },
    onCancel: () => {
      context.api.store.dispatch(endMismatchDialog());
      context.api.events.emit("steamkit-mismatch-cancel");
    },
  }));

  context.once(() => {
    modScrubber = new ModScrubber();

    downloadQueue = util.makeQueue<any>();

    context.api.setStylesheet("workshoppagestyle", path.join(__dirname, "workshop.scss"));
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
