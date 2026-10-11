using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using Common;
using DepotDownloader;

namespace DepotDownloaderNative
{
  /// <summary>Entry points the Vortex extension calls through node-api-dotnet.</summary>
  public static class NativeApi
  {
    private static LogWriter? sOutput;
    private static LogWriter? sError;

    /// <summary>Routes the downloader's console output to the host's log.</summary>
    /// <param name="log">Called with a log level and one or more lines, newline separated.</param>
    public static void SetLogger(Action<string, string> log)
    {
      var previousOutput = sOutput;
      var previousError = sError;
      sOutput = new LogWriter("debug", log);
      sError = new LogWriter("error", log);
      Console.SetOut(sOutput);
      Console.SetError(sError);
      previousOutput?.Dispose();
      previousError?.Dispose();
    }

    /// <summary>
    /// Loads the assemblies deployed alongside this one. Called on the JS thread: the host can only
    /// resolve them there, and the downloader first needs some on its worker threads.
    /// </summary>
    public static void LoadDependencies()
    {
      var directory = Path.GetDirectoryName(typeof(NativeApi).Assembly.Location)!;
      var pending = new Stack<Assembly>([typeof(NativeApi).Assembly]);
      var seen = new HashSet<string>();
      while (pending.TryPop(out var assembly))
      {
        foreach (var reference in assembly.GetReferencedAssemblies())
        {
          if (seen.Add(reference.Name!) && File.Exists(Path.Combine(directory, reference.Name + ".dll")))
          {
            pending.Push(Assembly.Load(reference));
          }
        }
      }
    }

    /// <summary>
    /// Verifies a Steam app's installed files when ManifestOnly is set, downloads a Workshop item when PubFile is
    /// set, else downloads the app's depots.
    /// </summary>
    /// <param name="cancellation">An AbortSignal from JavaScript; aborting it ends the run as cancelled.</param>
    /// <returns>How the run ended, with the files a verification restored; an unexpected failure throws.</returns>
    public static Task<RunResult> Run(
        RunParameters parameters, HostCallbacks host, CancellationToken cancellation = default)
    {
      return RunOffJsThread(() => Exec.Run(parameters, host, cancellation), cancellation);
    }

    /// <summary>The manifest each installed depot of a Steam app is at, per Steam's and steamkit's records.</summary>
    public static InstalledDepot[] InstalledManifests(string installDirectory, uint appId) =>
      InstalledVersion.ToVerify(installDirectory, appId)
        .Select(depot => new InstalledDepot(depot.depotId, depot.manifestId.ToString()))
        .ToArray();

    // Ties protected secrets to steamkit, so other DPAPI callers' data can't be passed off as ours.
    private static readonly byte[] sProtectionEntropy = "steamkit"u8.ToArray();

    /// <summary>Whether secrets can be protected with Windows DPAPI, readable only by the current user.</summary>
    public static bool CanProtect() => OperatingSystem.IsWindows();

    /// <summary>Encrypts a secret for the current Windows user, as base64.</summary>
    public static string Protect(string secret)
    {
      if (!OperatingSystem.IsWindows())
      {
        throw new PlatformNotSupportedException("Secrets can only be protected on Windows");
      }

      return Convert.ToBase64String(ProtectedData.Protect(
        Encoding.UTF8.GetBytes(secret), sProtectionEntropy, DataProtectionScope.CurrentUser));
    }

    /// <summary>Decrypts what <see cref="Protect"/> returned; null when it can't, such as another user's.</summary>
    public static string? Unprotect(string protectedSecret)
    {
      if (!OperatingSystem.IsWindows())
      {
        return null;
      }

      try
      {
        return Encoding.UTF8.GetString(ProtectedData.Unprotect(
          Convert.FromBase64String(protectedSecret), sProtectionEntropy, DataProtectionScope.CurrentUser));
      }
      catch (Exception exception) when (exception is CryptographicException or FormatException)
      {
        return null;
      }
    }

    // The downloader keeps a run's state in statics, so runs take turns.
    private static readonly SemaphoreSlim sRunning = new(1, 1);

    private static RunResult Cancelled() => new(RunOutcome.Cancelled, "The run was cancelled");

    /// <summary>
    /// The downloader blocks while it waits on Steam, and its callbacks into JS need the JS thread free.
    /// A run cancelled before its turn never starts; one cancelled while it runs ends as cancelled.
    /// </summary>
    internal static Task<RunResult> RunOffJsThread(
        Func<Task<string[]?>> run, CancellationToken cancellation = default) => Task.Run(async () =>
    {
      try
      {
        await sRunning.WaitAsync(cancellation);
      }
      catch (OperationCanceledException)
      {
        return Cancelled();
      }

      try
      {
        return RunResult.Completed(await run());
      }
      catch (Exception) when (cancellation.IsCancellationRequested)
      {
        return Cancelled();
      }
      catch (Exception exception) when (RunOutcome.Of(exception) is string outcome)
      {
        return new RunResult(outcome, exception.Message);
      }
      finally
      {
        sRunning.Release();
      }
    });
  }
}
