import { describe, expect, it, vi } from "vitest";

import { fakeApi } from "../../test/fakeApi";
import { endMismatchDialog } from "../actions/session";
import { IMismatch } from "../types/interface";
import type { IAccountKeeper } from "../util/steamAccount";
import UI from "./UI";

const selection = (enabled: boolean): IMismatch[] => [{ id: "1", enabled, filePath: "a.bsa" }];

describe("UI restore prompt", () => {
  it("switches only the job awaiting the restore prompt to restoring", () => {
    const { api, extensionApi } = fakeApi();
    const verifying = vi.fn();
    const queued = vi.fn();
    const verifyUi = new UI(extensionApi, verifying);
    new UI(extensionApi, queued);

    void verifyUi.reportMismatch(["a.bsa"]);
    api.events.emit("steamkit-mismatch-select", selection(true));

    expect(verifying).toHaveBeenCalledWith(0);
    expect(queued).not.toHaveBeenCalled();
  });

  it("remembers the files the user chose to restore", async () => {
    const { api, extensionApi } = fakeApi();
    const ui = new UI(extensionApi, vi.fn());

    const prompt = ui.reportMismatch(["a.bsa"]);
    api.events.emit("steamkit-mismatch-select", selection(true));

    expect(await prompt).toEqual(["a.bsa"]);
    expect(ui.restoreSelection).toEqual(["a.bsa"]);
  });

  it("remembers that the user left the files unchanged", async () => {
    const { api, extensionApi } = fakeApi();
    const ui = new UI(extensionApi, vi.fn());

    const prompt = ui.reportMismatch(["a.bsa"]);
    api.events.emit("steamkit-mismatch-cancel");

    expect(await prompt).toEqual([]);
    expect(ui.restoreSelection).toEqual([]);
  });

  it("has no restore selection when no files differed", () => {
    const { extensionApi } = fakeApi();

    expect(new UI(extensionApi, vi.fn()).restoreSelection).toBeUndefined();
  });
});

/** An account keeper that can or can't remember a sign-in, and records nothing. */
const keeper = (canRemember: boolean) =>
  ({ canRemember: async () => canRemember }) as unknown as IAccountKeeper;

describe("UI requestCredentials", () => {
  const signIn = (input: Record<string, unknown>) => ({ action: "Continue", input });

  it("offers to remember the sign-in when it can be kept protected", async () => {
    const { api, extensionApi } = fakeApi();
    api.showDialog.mockResolvedValue(signIn({ Username: "player", Password: "secret", rememberSignIn: true }));

    const answer = await new UI(extensionApi, vi.fn(), () => keeper(true)).requestCredentials();

    expect(api.showDialog.mock.calls[0][2].checkboxes).toEqual([
      expect.objectContaining({ id: "rememberSignIn", value: false }),
    ]);
    expect(answer).toEqual({ method: "password", username: "player", password: "secret", remember: true });
  });

  it("doesn't offer to remember a sign-in it can't keep protected", async () => {
    const { api, extensionApi } = fakeApi();
    api.showDialog.mockResolvedValue(signIn({ Username: "player", Password: "secret" }));

    const answer = await new UI(extensionApi, vi.fn(), () => keeper(false)).requestCredentials();

    expect(api.showDialog.mock.calls[0][2].checkboxes).toBeUndefined();
    expect(answer).toMatchObject({ remember: false });
  });

  it("remembers a QR code sign-in when asked to", async () => {
    const { api, extensionApi } = fakeApi();
    api.showDialog.mockResolvedValue({ action: "Use QR Code", input: { rememberSignIn: true } });

    const answer = await new UI(extensionApi, vi.fn(), () => keeper(true)).requestCredentials();

    expect(answer).toEqual({ method: "qrCode", remember: true });
  });
});

describe("UI confirmSignIn", () => {
  it("shows the QR code at a fixed size, not stretched to the dialog's width", () => {
    const { api, extensionApi } = fakeApi();
    api.showDialog.mockReturnValue(new Promise(() => undefined));

    void new UI(extensionApi, vi.fn()).confirmSignIn("data:image/png;base64,AAAA");

    const content = api.showDialog.mock.calls[0][2];
    expect(content.htmlText).toMatch(/<img [^>]*style="[^"]*width: 240px/);
  });
});

describe("UI closePrompts", () => {
  it("closes the restore prompt, restoring nothing", async () => {
    const { api, extensionApi } = fakeApi();
    const ui = new UI(extensionApi, vi.fn());
    const prompt = ui.reportMismatch(["a.bsa"]);

    ui.closePrompts();

    expect(await prompt).toEqual([]);
    expect(api.store.dispatch).toHaveBeenCalledWith(endMismatchDialog());
  });

  it("cancels the sign-in dialog it has open", () => {
    const { api, extensionApi } = fakeApi();
    api.showDialog.mockReturnValue(new Promise(() => undefined));
    const ui = new UI(extensionApi, vi.fn());
    void ui.requestSteamGuard();

    ui.closePrompts();

    expect(api.closeDialog).toHaveBeenCalledWith("steam-guard-dialog", "Cancel");
  });

  it("leaves another job's sign-in dialog open", () => {
    const { api, extensionApi } = fakeApi();
    api.showDialog.mockReturnValue(new Promise(() => undefined));
    void new UI(extensionApi, vi.fn()).requestSteamGuard();

    new UI(extensionApi, vi.fn()).closePrompts();

    expect(api.closeDialog).not.toHaveBeenCalled();
  });
});
