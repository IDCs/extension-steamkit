import { types } from "@nexusmods/vortex-api";

import UI, { IPromptServices } from "../delegates/UI";
import { ErrorKind, SteamkitError } from "../types/errors";
import { ISignInPurpose } from "../types/interface";

export interface ISteamJob {
  /** Shown while the job runs; its id is made unique per job. */
  notification: types.INotification & { id: string };
  /** Applied to the notification while Steam reports download progress. */
  progress: Partial<types.INotification>;
  /** Shown on the sign-in prompt when the job needs the user's Steam account. */
  signIn: ISignInPurpose;
}

// Steam jobs share one downloader, so they take turns; a job touches game files only on its turn.
let lastJobDone: Promise<void> = Promise.resolve();
let jobsWaitingOrRunning = 0;
let jobSequence = 0;

function untilAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

/**
 * Runs a job that talks to Steam once the jobs before it finish, showing its activity until it ends. The
 * notification's Cancel aborts the signal the job is given; however the job then fails, it fails as cancelled.
 */
export async function runSteamJob<T>(
  api: types.IExtensionApi,
  services: IPromptServices,
  job: ISteamJob,
  run: (ui: UI, signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const notificationId = `${job.notification.id}_${++jobSequence}`;
  const notification: types.INotification = {
    ...job.notification,
    id: notificationId,
    actions: [{ title: "Cancel", action: () => controller.abort() }],
  };
  const ui = new UI(api, job.signIn, services, (progress) =>
    api.sendNotification({ ...notification, ...job.progress, progress }),
  );
  controller.signal.addEventListener("abort", () => ui.closePrompts());

  const previousJobDone = lastJobDone;
  // Vortex's renderer can run with Bluebird as the global Promise, which has no withResolvers.
  let finish!: () => void;
  const done = new Promise<void>((resolve) => (finish = resolve));
  lastJobDone = previousJobDone.then(() => done);
  const mustWait = jobsWaitingOrRunning++ > 0;
  api.sendNotification(mustWait ? { ...notification, message: "Waiting for another Steam job to finish" } : notification);
  try {
    if (mustWait) {
      await Promise.race([previousJobDone, untilAborted(controller.signal)]);
      api.sendNotification(notification);
    }
    return await run(ui, controller.signal);
  } catch (err) {
    throw controller.signal.aborted
      ? new SteamkitError(ErrorKind.Cancelled, `${job.notification.title} was cancelled`)
      : err;
  } finally {
    jobsWaitingOrRunning--;
    finish();
    api.dismissNotification(notificationId);
  }
}
