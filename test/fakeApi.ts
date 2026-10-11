import { EventEmitter } from "node:events";

import type { types } from "@nexusmods/vortex-api";
import { vi } from "vitest";

/** The extension API calls steamkit's UI and error reporting make, recorded. */
export function fakeApi() {
  const api = {
    sendNotification: vi.fn<(notification: types.INotification) => string>(() => "notification"),
    dismissNotification: vi.fn<(id: string) => void>(),
    showErrorNotification:
      vi.fn<(message: string, detail: unknown, options?: types.IErrorOptions) => void>(),
    showDialog: vi.fn(),
    closeDialog: vi.fn<(id: string, actionKey?: string) => void>(),
    events: new EventEmitter(),
    store: { dispatch: vi.fn() },
    translate: (text: string) => text,
  };
  return { api, extensionApi: api as unknown as types.IExtensionApi };
}
