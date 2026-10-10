using System.Reflection;
using Common;

namespace DepotDownloaderNative.TestHost
{
  /// <summary>Drives the bridge the way the downloader does, without reaching Steam. Test use only.</summary>
  public static class Probes
  {
    // How DriveCallbacks prints a prompt the user cancelled.
    private const string Cancelled = "(cancelled)";

    /// <summary>Calls every host callback once through the delegates the downloader uses.</summary>
    public static async Task<string[]> DriveCallbacks(HostCallbacks host)
    {
      var credentials = await host.RequestCredentials();
      var guard = await host.RequestSteamGuard();
      var twoFactor = await host.Request2FA();
      var selected = await host.ReportMismatch(["a.bsa", "b.bsa"]);
      var mobileCancelled = await host.ConfirmSignIn(null);
      await host.EndSignInConfirmation();
      await host.ReportProgress(42);
      await host.RecordSignIn("player", "token", null);
      await host.ForgetLoginToken("player");

      return [
        $"credentials={(credentials.Cancelled ? Cancelled : $"{credentials.Username},{credentials.Password},remember={credentials.Remember}")}",
        $"guard={guard ?? Cancelled}",
        $"twoFactor={twoFactor ?? Cancelled}",
        $"selected={string.Join(',', selected)}",
        $"mobileCancelled={mobileCancelled}",
      ];
    }

    /// <summary>Waits until the token is cancelled; resolves to whether it was.</summary>
    public static async Task<bool> WaitUntilCancelled(CancellationToken cancellation)
    {
      try
      {
        await Task.Delay(TimeSpan.FromSeconds(10), cancellation);
        return false;
      }
      catch (OperationCanceledException)
      {
        return true;
      }
    }

    /// <summary>The codes a run can end with.</summary>
    public static string[] RunOutcomes() =>
      typeof(DepotDownloader.RunOutcome)
        .GetFields(BindingFlags.Public | BindingFlags.Static)
        .Where(field => field.IsLiteral)
        .Select(field => (string)field.GetRawConstantValue()!)
        .ToArray();

    /// <summary>Calls a host callback from a thread pool thread, as SteamKit2's callback loop does.</summary>
    public static Task<string> CallFromWorkerThread(Func<Task<string>> callback)
    {
      return Task.Run(callback);
    }

    public static void WriteConsole(string output, string error)
    {
      Console.WriteLine(output);
      Console.Error.WriteLine(error);
    }

    public static Task WriteConsoleFromWorkerThread(string output)
    {
      return Task.Run(() => Console.WriteLine(output));
    }

    /// <summary>Writes from a worker thread and the calling thread at once, as the downloader does.</summary>
    public static Task WriteConsoleFromBothThreads(int lines)
    {
      var worker = Task.Run(() =>
      {
        for (var i = 0; i < lines; i++)
        {
          Console.WriteLine($"worker {i}");
        }
      });
      for (var i = 0; i < lines; i++)
      {
        Console.WriteLine($"host {i}");
      }
      return worker;
    }
  }
}
