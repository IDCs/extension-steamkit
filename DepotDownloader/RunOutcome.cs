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
        public static string Of(Exception exception) => exception switch
        {
            SignInCancelledException => Cancelled,
            ContentDownloaderAccountException => AccessDenied,
            SignInFailedException => SignInFailed,
            SteamUnreachableException or HttpRequestException => SteamUnreachable,
            ContentDownloaderException => Failed,
            _ => null,
        };
    }

    /// <summary>How a run ended, and the downloader's explanation when it failed.</summary>
    public class RunResult(string outcome, string message = "")
    {
        public string Outcome { get; } = outcome;
        public string Message { get; } = message;
    }
}
