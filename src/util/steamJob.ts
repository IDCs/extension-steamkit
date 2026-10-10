import { types } from "@nexusmods/vortex-api";

import UI from "../delegates/UI";
import { ErrorKind, SteamkitError } from "../types/errors";

export interface ISteamJob {
  /** Shown while the job runs. */
  notification: types.INotification & { id: string };
  /** Applied to the notification while Steam reports download progress. */
  progress: Partial<types.INotification>;
}

/**
 * Runs a job that talks to Steam, showing its activity until it ends. The notification's Cancel
 * aborts the signal the job is given; however the job then fails, it fails as cancelled.
 */
export async function runSteamJob<T>(
  api: types.IExtensionApi,
  job: ISteamJob,
  run: (ui: UI, signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const notification: types.INotification = {
    ...job.notification,
    actions: [{ title: "Cancel", action: () => controller.abort() }],
  };
  const ui = new UI(api, (progress) =>
    api.sendNotification({ ...notification, ...job.progress, progress }),
  );
  controller.signal.addEventListener("abort", () => ui.closePrompts());
  api.sendNotification(notification);
  try {
    return await run(ui, controller.signal);
  } catch (err) {
    throw controller.signal.aborted
      ? new SteamkitError(ErrorKind.Cancelled, `${job.notification.title} was cancelled`)
      : err;
  } finally {
    api.dismissNotification(job.notification.id);
    ui.detach();
  }
}
