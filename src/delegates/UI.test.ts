import type { types } from "@nexusmods/vortex-api";
import { describe, expect, it, vi } from "vitest";

import { promptServices } from "../../test/fakeAccounts";
import { fakeApi } from "../../test/fakeApi";
import { SignInMethod } from "../types/interface";
import UI, { IPromptServices } from "./UI";

const PURPOSE = { title: "Sign in to Steam", text: "The job needs your Steam account." };

const ui = (extensionApi: types.IExtensionApi, onProgress = vi.fn(), services: IPromptServices = promptServices()) =>
  new UI(extensionApi, PURPOSE, services, onProgress);

describe("UI restore prompt", () => {
  it("asks about every differing file and restores those the user selects", async () => {
    const { extensionApi } = fakeApi();
    const services = promptServices();

    const restored = ui(extensionApi, vi.fn(), services).reportMismatch(["a.bsa", "b.bsa"]);
    expect(services.restorePrompt.pending?.files).toEqual(["a.bsa", "b.bsa"]);
    services.restorePrompt.answer(["a.bsa"]);

    expect(await restored).toEqual(["a.bsa"]);
  });

  it("restores nothing, and reports no restoring, when the user cancels", async () => {
    const { extensionApi } = fakeApi();
    const services = promptServices();
    const onProgress = vi.fn();

    const restored = ui(extensionApi, onProgress, services).reportMismatch(["a.bsa"]);
    services.restorePrompt.cancel();

    expect(await restored).toEqual([]);
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("switches the job's notification to restoring once files are chosen", async () => {
    const { extensionApi } = fakeApi();
    const services = promptServices();
    const onProgress = vi.fn();

    const restored = ui(extensionApi, onProgress, services).reportMismatch(["a.bsa"]);
    services.restorePrompt.answer(["a.bsa"]);
    await restored;

    expect(onProgress).toHaveBeenCalledWith(0);
  });
});

describe("UI requestCredentials", () => {
  const signIn = (input: Record<string, unknown>) => ({ action: "Continue", input });

  it("explains the sign-in with the job that asks for it", async () => {
    const { api, extensionApi } = fakeApi();
    api.showDialog.mockResolvedValue({ action: "Cancel", input: {} });
    const purpose = { title: "Sign in to download from the Workshop", text: "The item needs your Steam account." };

    await new UI(extensionApi, purpose, promptServices(), vi.fn()).requestCredentials();

    expect(api.showDialog.mock.calls[0][1]).toBe(purpose.title);
    expect(api.showDialog.mock.calls[0][2].bbcode).toContain(purpose.text);
    expect(api.showDialog.mock.calls[0][2].bbcode).not.toContain("Verify");
  });

  it("offers to remember the sign-in when it can be kept protected", async () => {
    const { api, extensionApi } = fakeApi();
    api.showDialog.mockResolvedValue(signIn({ Username: "player", Password: "secret", rememberSignIn: true }));

    const answer = await ui(extensionApi).requestCredentials();

    expect(api.showDialog.mock.calls[0][2].checkboxes).toEqual([
      expect.objectContaining({ id: "rememberSignIn", value: false }),
    ]);
    expect(answer).toEqual({ method: SignInMethod.Password, username: "player", password: "secret", remember: true });
  });

  it("doesn't offer to remember a sign-in it can't keep protected", async () => {
    const { api, extensionApi } = fakeApi();
    api.showDialog.mockResolvedValue(signIn({ Username: "player", Password: "secret" }));

    const answer = await ui(extensionApi, vi.fn(), promptServices({ canRemember: false })).requestCredentials();

    expect(api.showDialog.mock.calls[0][2].checkboxes).toBeUndefined();
    expect(answer).toMatchObject({ remember: false });
  });

  it("remembers a QR code sign-in when asked to", async () => {
    const { api, extensionApi } = fakeApi();
    api.showDialog.mockResolvedValue({ action: "Use QR Code", input: { rememberSignIn: true } });

    const answer = await ui(extensionApi).requestCredentials();

    expect(answer).toEqual({ method: SignInMethod.QrCode, remember: true });
  });

  it("keeps Continue disabled until both the username and password are filled", async () => {
    const { api, extensionApi } = fakeApi();
    api.showDialog.mockResolvedValue({ action: "Cancel", input: {} });
    await ui(extensionApi).requestCredentials();
    const content: types.IDialogContent = api.showDialog.mock.calls[0][2];
    const withInput = (username: string, password: string) => ({
      ...content,
      input: [
        { id: "Username", value: username },
        { id: "Password", value: password },
      ],
    });

    expect(content.condition!(withInput("player", ""))).toEqual([
      expect.objectContaining({ actions: ["Continue"] }),
    ]);
    expect(content.condition!(withInput("player", "secret"))).toEqual([]);
  });
});

describe("UI confirmSignIn", () => {
  it("shows the QR code at a fixed size, not stretched to the dialog's width", () => {
    const { api, extensionApi } = fakeApi();
    api.showDialog.mockReturnValue(new Promise(() => undefined));

    void ui(extensionApi).confirmSignIn("data:image/png;base64,AAAA");

    const content = api.showDialog.mock.calls[0][2];
    expect(content.htmlText).toMatch(/<img [^>]*style="[^"]*width: 240px/);
  });
});

describe("UI closePrompts", () => {
  it("cancels the restore prompt it has open", async () => {
    const { extensionApi } = fakeApi();
    const job = ui(extensionApi);
    const restored = job.reportMismatch(["a.bsa"]);

    job.closePrompts();

    expect(await restored).toEqual([]);
  });

  it("leaves the restore prompt another job has open", () => {
    const { extensionApi } = fakeApi();
    const services = promptServices();
    void ui(extensionApi, vi.fn(), services).reportMismatch(["a.bsa"]);

    ui(extensionApi, vi.fn(), services).closePrompts();

    expect(services.restorePrompt.pending?.files).toEqual(["a.bsa"]);
  });

  it("cancels the sign-in dialog it has open", () => {
    const { api, extensionApi } = fakeApi();
    api.showDialog.mockReturnValue(new Promise(() => undefined));
    const job = ui(extensionApi);
    void job.requestSteamGuard();

    job.closePrompts();

    expect(api.closeDialog).toHaveBeenCalledWith("steam-guard-dialog", "Cancel");
  });

  it("leaves another job's sign-in dialog open", () => {
    const { api, extensionApi } = fakeApi();
    api.showDialog.mockReturnValue(new Promise(() => undefined));
    void ui(extensionApi).requestSteamGuard();

    ui(extensionApi).closePrompts();

    expect(api.closeDialog).not.toHaveBeenCalled();
  });
});
