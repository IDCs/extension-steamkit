// This file is subject to the terms and conditions defined
// in file 'LICENSE', which is part of this source code package.

using System;
using System.Net.Http;

namespace DepotDownloader
{
    /// <summary>Steam refused the sign-in.</summary>
    public class SignInFailedException(string message) : Exception(message);

    /// <summary>Steam could not be reached.</summary>
    public class SteamUnreachableException(string message) : Exception(message);

    /// <summary>How a run ended, as a stable code the host classifies failures by.</summary>
    public static class RunOutcome
    {
        public const string Completed = "completed";
        public const string Cancelled = "cancelled";
        public const string AccessDenied = "access-denied";
        public const string SignInFailed = "sign-in-failed";
        public const string SteamUnreachable = "steam-unreachable";
        public const string Failed = "failed";

        /// <summary>The outcome an expected failure ends a run with; null for an unexpected one.</summary>
        public static string? Of(Exception exception) => exception switch
        {
            SignInCancelledException => Cancelled,
            ContentDownloaderAccountException => AccessDenied,
            SignInFailedException => SignInFailed,
            SteamUnreachableException or HttpRequestException => SteamUnreachable,
            // A request Steam didn't answer in time; a user's cancel is caught before this.
            ContentDownloaderException or OperationCanceledException => Failed,
            _ => null,
        };
    }

    /// <summary>How a run ended, and the downloader's explanation when it failed.</summary>
    public class RunResult(string outcome, string message = "")
    {
        public string Outcome { get; } = outcome;
        public string Message { get; } = message;
        /// <summary>Whether a verification found files that differ from Steam's.</summary>
        public bool FilesDiffered { get; private init; }
        /// <summary>The files a verification restored; never null, as JavaScript can't read a null array.</summary>
        public string[] RestoredFiles { get; private init; } = [];

        /// <summary>A completed run, given the files it restored: null when none differed, empty when the user restored none.</summary>
        public static RunResult Completed(string[]? restoredFiles) =>
            new(RunOutcome.Completed) { FilesDiffered = restoredFiles != null, RestoredFiles = restoredFiles ?? [] };
    }
}
