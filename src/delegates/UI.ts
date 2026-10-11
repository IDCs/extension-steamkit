import type { types } from "@nexusmods/vortex-api";

import { ISignInPurpose, ProgressCallback, SignInAnswer, SignInMethod } from "../types/interface";
import type { RestorePrompt } from "../util/restorePrompt";
import type { IAccountKeeper } from "../util/steamAccount";

/** What a job's prompts use beyond the extension API. */
export interface IPromptServices {
  accounts: IAccountKeeper;
  restorePrompt: RestorePrompt;
}

const SIGN_IN_DIALOG = "steam-sign-in-dialog";
const CREDENTIALS_DIALOG = "steamkit-login-screen";
const STEAM_GUARD_DIALOG = "steam-guard-dialog";
const TWO_FACTOR_DIALOG = "steam-2fa-dialog";
const USERNAME = "Username";
const PASSWORD = "Password";
// Not "remember": Vortex applies a checkbox with that id to every pending dialog with the same title.
const REMEMBER_SIGN_IN = "rememberSignIn";

/** The buttons of the job's prompts, as Vortex reports the one the user clicked. */
const DialogAction = {
  Cancel: "Cancel",
  Close: "Close",
  Continue: "Continue",
  UseQrCode: "Use QR Code",
} as const;

/** Answers the downloader's prompts with Vortex dialogs. A prompt the user cancels resolves to undefined. */
class UI {
  /** Keeps the job's Steam sign-in. */
  public readonly accounts: IAccountKeeper;
  private mApi: types.IExtensionApi;
  private mRestorePrompt: RestorePrompt;
  private mAskingRestore = false;
  private mSignIn: ISignInPurpose;
  private mOnProgress: ProgressCallback;
  // keyed by dialog id; a QR code prompt reopens under the same id before the old one settles
  private mOpenDialogCounts = new Map<string, number>();

  constructor(
    api: types.IExtensionApi,
    signIn: ISignInPurpose,
    services: IPromptServices,
    onProgress: ProgressCallback,
  ) {
    this.mApi = api;
    this.mSignIn = signIn;
    this.accounts = services.accounts;
    this.mRestorePrompt = services.restorePrompt;
    this.mOnProgress = onProgress;
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
    const canRemember = await this.accounts.canRemember();
    const result = await this.showPrompt(
      CREDENTIALS_DIALOG,
      "question",
      t(this.mSignIn.title),
      {
        bbcode:
          t(this.mSignIn.text) +
          "[br][/br][br][/br]" +
          t(
            "Enter your Steam username and password, or sign in with a QR code from the Steam Mobile app. " +
              "If you use Steam Guard, you have 30 seconds to enter its code on the next screen. " +
              "Vortex never stores your password.",
          ),
        input: [
          { id: USERNAME, type: "text", label: "Username" },
          { id: PASSWORD, type: "password", label: "Password" },
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
        condition: (content) => {
          const isFilled = (fieldId: string) =>
            (content.input?.find((field) => field.id === fieldId)?.value ?? "") !== "";
          return isFilled(USERNAME) && isFilled(PASSWORD)
            ? []
            : [{ id: PASSWORD, actions: [DialogAction.Continue], errorText: t("Enter your username and password") }];
        },
      },
      [
        { label: DialogAction.Cancel },
        { label: DialogAction.UseQrCode },
        { label: DialogAction.Continue, default: true },
      ],
    );
    const remember = canRemember && result.input[REMEMBER_SIGN_IN] === true;
    switch (result.action) {
      case DialogAction.UseQrCode:
        return { method: SignInMethod.QrCode, remember };
      case DialogAction.Continue:
        return {
          method: SignInMethod.Password,
          username: result.input[USERNAME],
          password: result.input[PASSWORD],
          remember,
        };
      default:
        return undefined;
    }
  };

  public requestSteamGuard = async (): Promise<string | undefined> => {
    const code = await this.requestCode(
      STEAM_GUARD_DIALOG,
      "Steam Guard Code Required",
      "Steam has sent you a Steam Guard Code, this will be to either your email address or your Steam mobile app.\n" +
        "Please enter the code below:\n\n" +
        "Note: if you have not received your code, please check your spam folder or contact Steam support.",
      { id: "SteamGuard", type: "text", label: "Steam guard code", placeholder: "Not case sensitive" },
    );
    return code?.toUpperCase();
  };

  public request2FA = async (): Promise<string | undefined> =>
    this.requestCode(
      TWO_FACTOR_DIALOG,
      "Two Factor Authentication Required",
      "Please authenticate using your 2FA application",
      { id: "2FA", type: "text", label: "Two Factor Auth Key" },
    );

  private async requestCode(
    dialogId: string,
    title: string,
    text: string,
    input: types.IInput,
  ): Promise<string | undefined> {
    const result = await this.showPrompt(dialogId, "question", title, { text, input: [input] }, [
      { label: DialogAction.Cancel },
      { label: DialogAction.Continue, default: true },
    ]);
    return result.action === DialogAction.Continue ? result.input[input.id] : undefined;
  }

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
    const result = await this.showPrompt(SIGN_IN_DIALOG, "info", "Approve the Sign-in", content, [
      { label: DialogAction.Cancel },
    ]);
    return result.action === DialogAction.Cancel;
  };

  public endSignInConfirmation = async (): Promise<void> => {
    this.closeSignInDialog();
  };

  // Closing with an action settles the dialog, so its pending confirmSignIn call returns.
  private closeSignInDialog = () => {
    this.mApi.closeDialog(SIGN_IN_DIALOG, DialogAction.Close);
  };

  public reportProgress = async (percent: number): Promise<void> => {
    this.mOnProgress(percent);
  };

  /** Asks which of the files that differ to restore, all selected at first; cancelling restores none. */
  public reportMismatch = async (files: string[]): Promise<string[]> => {
    this.mAskingRestore = true;
    const selected = await this.mRestorePrompt.ask(files).finally(() => (this.mAskingRestore = false));
    if (selected.length > 0) {
      // Restoring starts now; its progress follows.
      this.mOnProgress(0);
    }
    return selected;
  };

  /** Closes every prompt this job has open, as the user cancelling it. */
  public closePrompts() {
    for (const [dialogId, openCount] of this.mOpenDialogCounts) {
      if (openCount > 0) {
        this.mApi.closeDialog(dialogId, DialogAction.Cancel);
      }
    }
    if (this.mAskingRestore) {
      this.mRestorePrompt.cancel();
    }
  }
}

export default UI;
