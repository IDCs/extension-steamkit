import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

import { fakeApi } from "../../test/fakeApi";
import { ErrorKind, SteamkitError } from "../types/errors";
import { classifyError, type ErrorLog, logError, reportError, setErrorLog } from "./errors";

/** A network failure as Node raises it, with its error code. */
function networkError(code: string): Error {
  return Object.assign(new Error(`getaddrinfo ${code} api.steampowered.com`), { code });
}

describe("classifyError", () => {
  it("takes the kind a steamkit error carries", () => {
    expect(classifyError(new SteamkitError(ErrorKind.AccessDenied, "not owned"))).toBe(
      ErrorKind.AccessDenied,
    );
  });

  it.each(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENETUNREACH"])(
    "classes a %s network failure as Steam out of reach",
    (code) => {
      expect(classifyError(networkError(code))).toBe(ErrorKind.SteamUnreachable);
    },
  );

  it("classes a network failure fetch wraps as Steam out of reach", () => {
    const failure = new TypeError("fetch failed", { cause: networkError("ENOTFOUND") });

    expect(classifyError(failure)).toBe(ErrorKind.SteamUnreachable);
  });

  it("classes a request that timed out as Steam out of reach", () => {
    expect(classifyError(new DOMException("The operation timed out", "TimeoutError"))).toBe(
      ErrorKind.SteamUnreachable,
    );
  });

  it.each([new Error("boom"), "a thrown string", undefined])(
    "classes anything else as unexpected (%s)",
    (err) => {
      expect(classifyError(err)).toBe(ErrorKind.Unexpected);
    },
  );
});

describe("reportError", () => {
  it("shows nothing when the user cancelled", () => {
    const { api, extensionApi } = fakeApi();

    reportError(extensionApi, "Failed to verify", new SteamkitError(ErrorKind.Cancelled, ""));

    expect(api.sendNotification).not.toHaveBeenCalled();
    expect(api.showErrorNotification).not.toHaveBeenCalled();
  });

  it("warns that the game must be installed by Steam", () => {
    const { api, extensionApi } = fakeApi();

    reportError(
      extensionApi,
      "Failed to verify",
      new SteamkitError(ErrorKind.NotSteamGame, "Not a steam game"),
    );

    expect(api.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "warning", message: "Must be a game installed by Steam" }),
    );
    expect(api.showErrorNotification).not.toHaveBeenCalled();
  });

  it.each([
    ErrorKind.AccessDenied,
    ErrorKind.SignInFailed,
    ErrorKind.SteamUnreachable,
    ErrorKind.Failed,
    ErrorKind.InvalidInput,
  ])("shows a %s failure with its message, without offering a report", (kind) => {
    const { api, extensionApi } = fakeApi();

    reportError(extensionApi, "Failed to verify", new SteamkitError(kind, "Steam said no"));

    expect(api.showErrorNotification).toHaveBeenCalledWith("Failed to verify", "Steam said no", {
      allowReport: false,
    });
  });

  it("shows a network failure without offering a report", () => {
    const { api, extensionApi } = fakeApi();

    reportError(extensionApi, "Failed to browse", networkError("ENOTFOUND"));

    expect(api.showErrorNotification).toHaveBeenCalledWith(
      "Failed to browse",
      "getaddrinfo ENOTFOUND api.steampowered.com",
      { allowReport: false },
    );
  });

  it("offers to report an unexpected failure", () => {
    const { api, extensionApi } = fakeApi();
    const failure = new Error("boom");

    reportError(extensionApi, "Failed to verify", failure);

    expect(api.showErrorNotification).toHaveBeenCalledWith("Failed to verify", failure, {
      allowReport: true,
    });
  });
});

describe("logError", () => {
  let log: Mock<ErrorLog>;

  beforeEach(() => {
    log = vi.fn<ErrorLog>();
    setErrorLog(log);
  });

  it("logs an unexpected failure as an error", () => {
    const failure = new Error("boom");

    logError("Failed to open the link", failure);

    expect(log).toHaveBeenCalledWith("error", "Failed to open the link", failure);
  });

  it("logs an expected failure as a warning", () => {
    const failure = networkError("ENOTFOUND");

    logError("Failed to open the link", failure);

    expect(log).toHaveBeenCalledWith("warn", "Failed to open the link", failure);
  });

  it("logs a cancellation for debugging only", () => {
    const failure = new SteamkitError(ErrorKind.Cancelled, "");

    logError("Failed to verify", failure);

    expect(log).toHaveBeenCalledWith("debug", "Failed to verify", failure);
  });
});
