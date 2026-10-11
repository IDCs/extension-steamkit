import { describe, expect, it, vi } from "vitest";

import { RestorePrompt } from "./restorePrompt";

describe("RestorePrompt", () => {
  it("shows the dialog with the files, and resolves to the user's selection", async () => {
    const show = vi.fn();
    const prompt = new RestorePrompt(show);

    const selection = prompt.ask(["a.bsa", "b.bsa"]);
    expect(prompt.pending?.files).toEqual(["a.bsa", "b.bsa"]);
    expect(show).toHaveBeenLastCalledWith(true);
    prompt.answer(["b.bsa"]);

    expect(await selection).toEqual(["b.bsa"]);
    expect(show).toHaveBeenLastCalledWith(false);
    expect(prompt.pending).toBeUndefined();
  });

  it("restores nothing when cancelled", async () => {
    const prompt = new RestorePrompt(vi.fn());

    const selection = prompt.ask(["a.bsa"]);
    prompt.cancel();

    expect(await selection).toEqual([]);
  });

  it("gives each request its own id", () => {
    const prompt = new RestorePrompt(vi.fn());

    void prompt.ask(["a.bsa"]);
    const first = prompt.pending?.requestId;
    void prompt.ask(["a.bsa"]);

    expect(prompt.pending?.requestId).not.toBe(first);
  });

  it("ends a waiting request when a new one starts, restoring nothing for it", async () => {
    const prompt = new RestorePrompt(vi.fn());

    const first = prompt.ask(["a.bsa"]);
    void prompt.ask(["b.bsa"]);

    expect(await first).toEqual([]);
    expect(prompt.pending?.files).toEqual(["b.bsa"]);
  });
});
