import type { types } from "@nexusmods/vortex-api";
import { generate } from "shortid";

import { endMismatchDialog, setMismatchState } from "../actions/session";
import { ErrorKind, SteamkitError } from "../types/errors";
import { IMismatch, ProgressCallback, SignInAnswer, SignInMethod } from "../types/interface";
import { reportError } from "../util/errors";
import { IAccountKeeper, IRememberedAccount, sharedAccountKeeper } from "../util/steamAccount";

const SIGN_IN_DIALOG = "steam-sign-in-dialog";
const CREDENTIALS_DIALOG = "steamkit-login-screen";
const STEAM_GUARD_DIALOG = "steam-guard-dialog";
const TWO_FACTOR_DIALOG = "steam-2fa-dialog";
const USE_QR_CODE = "Use QR Code";
// Not "remember": Vortex applies a checkbox with that id to every pending dialog with the same title.
const REMEMBER_SIGN_IN = "rememberSignIn";

/** Answers the downloader's prompts with Vortex dialogs. A prompt the user cancels resolves to undefined. */
class UI {
  private mApi: types.IExtensionApi;
  private mOnProgress: ProgressCallback;
  private mResolveMismatch: ((selected: string[]) => void) | undefined;
  // keyed by dialog id; a QR code prompt reopens under the same id before the old one settles
  private mOpenDialogCounts = new Map<string, number>();

  private mAccountKeeper: () => IAccountKeeper;

  constructor(
    api: types.IExtensionApi,
    onProgress: ProgressCallback,
    accountKeeper: () => IAccountKeeper = sharedAccountKeeper,
  ) {
    this.mApi = api;
    this.mOnProgress = onProgress;
    this.mAccountKeeper = accountKeeper;
    api.events
      .on("steamkit-mismatch-select", this.onMismatchSelect)
      .on("steamkit-mismatch-cancel", this.onMismatchCancel);
  }

  public detach() {
    this.mApi.events
      .removeListener("steamkit-mismatch-select", this.onMismatchSelect)
      .removeListener("steamkit-mismatch-cancel", this.onMismatchCancel);
  }

  // Shows one of this job's prompts, tracked so cancelling the job closes it.
  private async showPrompt(
    dialogId: string,
    type: types.DialogType,
    title: string,
    content: types.IDialogContent,
    actions: types.DialogActions,
  ): Promise<types.IDialogResult> {
    this.mOpenDialogCounts.set(dialogId, (this.mOpenDialogCounts.get(dialogId) ?? 0) + 1);
    try {
      return await this.mApi.showDialog(type, title, content, actions, dialogId);
    } finally {
      this.mOpenDialogCounts.set(dialogId, this.mOpenDialogCounts.get(dialogId)! - 1);
    }
  }

  public requestCredentials = async (): Promise<SignInAnswer | undefined> => {
    const t = this.mApi.translate;
    const canRemember = await this.mAccountKeeper().canRemember();
    const res = await this.showPrompt(
      CREDENTIALS_DIALOG,
      "question",
      "Verify Integrity of Steam Game Files",
      {
        bbcode: t(
          "If you are missing textures or other content in game, or experiencing " +
            "crashing while playing a game, you can have Steam verify that the game's " +
            "files are installed correctly on your computer. Steam will restore any " +
            "original files that have been altered or are missing{{bl}}" +
            "Note: this check is only available with Steam games and can not fix " +
            "issues with mod conflicts.{{bl}}" +
            "To continue, please enter your Steam credentials, or sign in with a QR code from the " +
            "Steam Mobile app. If you are using Steam guard, you will have 30 seconds to enter your " +
            "code on the next screen. Vortex never stores your password.",
          { replace: { bl: "[br][/br][br][/br]" } },
        ),
        input: [
          { id: "Username", type: "text", label: "Username" },
          { id: "Password", type: "password", label: "Password" },
        ],
        checkboxes: canRemember
          ? [
              {
                id: REMEMBER_SIGN_IN,
                text: t("Remember me on this PC"),
                subText: t(
                  "Keeps a Steam sign-in token, encrypted for your Windows account, so you aren't asked " +
                    "again. Forget it any time in Settings.",
                ),
                value: false,
              },
            ]
          : undefined,
      },
      [{ label: "Cancel" }, { label: USE_QR_CODE }, { label: "Continue", default: true }],
    );
    if (res.action === "Cancel") {
      return undefined;
    }
    const remember = canRemember && res.input[REMEMBER_SIGN_IN] === true;
    if (res.action === USE_QR_CODE) {
      return { method: SignInMethod.QrCode, remember };
    }
    const username: string = res.input["Username"];
    const password: string = res.input["Password"];
    if (username === undefined || username === "" || password === undefined || password === "") {
      reportError(
        this.mApi,
        "Unable to complete Steam operation",
        new SteamkitError(ErrorKind.InvalidInput, "Please provide valid credentials"),
      );
      return undefined;
    }
    return { method: SignInMethod.Password, username, password, remember };
  };

  /** The Steam account the extension remembers signing in as, for the downloader. */
  public rememberedAccount = async (): Promise<IRememberedAccount | undefined> =>
    this.mAccountKeeper().remembered();

  // The bridge hands over a missing token or Steam Guard record as undefined.
  public recordSignIn = async (account: string, loginToken?: string, guardData?: string) =>
    this.mAccountKeeper().recordSignIn(account, loginToken, guardData);

  public forgetLoginToken = async (_account: string) => this.mAccountKeeper().forgetLoginToken();

  public requestSteamGuard = async (): Promise<string | undefined> => {
    const res = await this.showPrompt(
      STEAM_GUARD_DIALOG,
      "question",
      "Steam Guard Code Required",
      {
        text:
          "Steam has sent you a Steam Guard Code, this will be to either your email address or your Steam mobile app.\n" +
          "Please enter the code below:\n\n" +
          "Note: if you have not received your code, please check your spam folder or contact Steam support.",
        input: [
          {
            id: "SteamGuard",
            type: "text",
            label: "Steam guard code",
            placeholder: "Not case sensitive",
          },
        ],
      },
      [{ label: "Cancel" }, { label: "Continue", default: true }],
    );
    const code: string = res.input["SteamGuard"];
    return res.action !== "Cancel" && code !== undefined && code !== ""
      ? code.toUpperCase()
      : undefined;
  };

  public request2FA = async (): Promise<string | undefined> => {
    const res = await this.showPrompt(
      TWO_FACTOR_DIALOG,
      "question",
      "Two Factor Authentication Required",
      {
        text: "Please authenticate using your 2FA application",
        input: [{ id: "2FA", type: "text", label: "Two Factor Auth Key" }],
      },
      [{ label: "Cancel" }, { label: "Continue", default: true }],
    );
    return res.action !== "Cancel" ? res.input["2FA"] : undefined;
  };

  public confirmSignIn = async (qrCode?: string): Promise<boolean> => {
    // Steam replaces its QR code as it expires; the new prompt settles the old one.
    this.closeSignInDialog();
    const content: types.IDialogContent =
      qrCode === undefined
        ? {
            text: "Steam has sent a sign-in request to your Steam Mobile app. Approve it there to continue.",
          }
        : {
            htmlText:
              "<p>Scan this code with the Steam Mobile app to sign in.</p>" +
              // HTML dialogs stretch images to their width; pixelated keeps the code sharp.
              `<img src="${qrCode}" alt="Steam sign-in QR code" style="width: 240px; height: 240px; ` +
              `image-rendering: pixelated; display: block; margin: 0 auto;" />`,
          };
    const res = await this.showPrompt(SIGN_IN_DIALOG, "info", "Approve the Sign-in", content, [
      { label: "Cancel" },
    ]);
    return res.action === "Cancel";
  };

  public endSignInConfirmation = async (): Promise<void> => {
    this.closeSignInDialog();
  };

  // Closing with an action settles the dialog, so its pending confirmSignIn call returns.
  private closeSignInDialog = () => {
    this.mApi.closeDialog(SIGN_IN_DIALOG, "Close");
  };

  public reportProgress = async (percent: number): Promise<void> => {
    this.mOnProgress(percent);
  };

  /** Closes every prompt this job has open, as the user cancelling it; the restore prompt restores nothing. */
  public closePrompts() {
    for (const [dialogId, openCount] of this.mOpenDialogCounts) {
      if (openCount > 0) {
        this.mApi.closeDialog(dialogId, "Cancel");
      }
    }
    if (this.awaitsMismatch()) {
      this.mApi.store.dispatch(endMismatchDialog());
      this.settleMismatch([]);
    }
  }

  /** The files the user chose to restore, empty when they left them unchanged; undefined until asked. */
  public restoreSelection: string[] | undefined;

  /** Resolves to the files the user selects to restore; cancelling restores none. */
  public reportMismatch = (files: string[]): Promise<string[]> => {
    const mismatches: IMismatch[] = files.map((filePath) => ({
      id: generate(),
      enabled: true,
      filePath,
    }));
    return new Promise((resolve) => {
      this.mResolveMismatch = resolve;
      this.mApi.store.dispatch(setMismatchState({ mismatches }));
    });
  };

  // The restore prompt is shared; only the job that showed it answers.
  private awaitsMismatch = () => this.mResolveMismatch !== undefined;

  private settleMismatch = (selected: string[]) => {
    if (!this.awaitsMismatch()) {
      return;
    }
    this.restoreSelection = selected;
    this.mResolveMismatch!(selected);
    this.mResolveMismatch = undefined;
  };

  private onMismatchSelect = (mismatches: IMismatch[]) => {
    const selected = mismatches.filter((m) => m.enabled).map((m) => m.filePath);
    if (this.awaitsMismatch() && selected.length > 0) {
      // Restoring starts now; its progress follows.
      this.mOnProgress(0);
    }
    this.settleMismatch(selected);
  };

  private onMismatchCancel = () => this.settleMismatch([]);
}

export default UI;
