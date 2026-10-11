import { describe, expect, it } from "vitest";

import { promptServices } from "../../test/fakeAccounts";
import { fakeApi } from "../../test/fakeApi";
import { ErrorKind } from "../types/errors";
import { ISteamJob, runSteamJob } from "./steamJob";

const services = promptServices();

const job = (id: string): ISteamJob => ({
  notification: { id, type: "activity", title: id, message: "Connecting to Steam servers" },
  progress: {},
  signIn: { title: "Sign in to Steam", text: "" },
});

const deferred = () => Promise.withResolvers<void>();

describe("runSteamJob", () => {
  it("runs a job once the job before it finishes", async () => {
    const { extensionApi } = fakeApi();
    const first = deferred();
    const order: string[] = [];

    const firstJob = runSteamJob(extensionApi, services, job("first"), async () => {
      order.push("first started");
      await first.promise;
      order.push("first done");
    });
    const secondJob = runSteamJob(extensionApi, services, job("second"), async () => {
      order.push("second started");
    });
    await Promise.resolve();
    first.resolve();
    await Promise.all([firstJob, secondJob]);

    expect(order).toEqual(["first started", "first done", "second started"]);
  });

  it("shows that a job waits for the one before it", async () => {
    const { api, extensionApi } = fakeApi();
    const first = deferred();

    const firstJob = runSteamJob(extensionApi, services, job("first"), () => first.promise);
    const secondJob = runSteamJob(extensionApi, services, job("second"), async () => undefined);
    const shownForSecond = api.sendNotification.mock.calls
      .map(([notification]) => notification)
      .filter((notification) => notification.title === "second");
    first.resolve();
    await Promise.all([firstJob, secondJob]);

    expect(shownForSecond[0].message).toBe("Waiting for another Steam job to finish");
  });

  it("ends a job cancelled while it waits, without running it", async () => {
    const { api, extensionApi } = fakeApi();
    const first = deferred();
    let secondRan = false;

    const firstJob = runSteamJob(extensionApi, services, job("first"), () => first.promise);
    const secondJob = runSteamJob(extensionApi, services, job("second"), async () => {
      secondRan = true;
    });
    const waiting = api.sendNotification.mock.calls.find(([notification]) => notification.title === "second")![0];
    waiting.actions![0].action(() => undefined);

    await expect(secondJob).rejects.toMatchObject({ kind: ErrorKind.Cancelled });
    first.resolve();
    await firstJob;
    expect(secondRan).toBe(false);
  });

  it("runs the next job after one fails", async () => {
    const { extensionApi } = fakeApi();

    const failed = runSteamJob(extensionApi, services, job("failed"), async () => {
      throw new Error("Steam is down");
    });
    const next = runSteamJob(extensionApi, services, job("next"), async () => "ran");

    await expect(failed).rejects.toThrow("Steam is down");
    expect(await next).toBe("ran");
  });

  it("runs where the global Promise has only Bluebird's statics, as in Vortex's renderer", async () => {
    const { extensionApi } = fakeApi();
    const withResolvers = Promise.withResolvers;
    delete (Promise as Partial<PromiseConstructor>).withResolvers;
    try {
      expect(await runSteamJob(extensionApi, services, job("bluebird"), async () => "ran")).toBe("ran");
    } finally {
      Promise.withResolvers = withResolvers;
    }
  });

  it("dismisses the job's notification when it ends", async () => {
    const { api, extensionApi } = fakeApi();

    await runSteamJob(extensionApi, services, job("only"), async () => undefined);

    const shownId = api.sendNotification.mock.calls.at(-1)![0].id;
    expect(api.dismissNotification).toHaveBeenCalledWith(shownId);
  });
});
