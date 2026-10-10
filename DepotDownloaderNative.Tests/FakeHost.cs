using Common;

namespace DepotDownloaderNative.Tests
{
  /// <summary>A host with fixed answers that records its prompts; JavaScript tests cover the real boundary.</summary>
  internal sealed class FakeHost
  {
    public List<string> Calls { get; } = [];

    /// <summary>The answer to a Steam Guard or two-factor prompt; null as the user cancelling it.</summary>
    public string? Code { get; set; } = "CODE";

    /// <summary>The files the user selects to restore when shown mismatches.</summary>
    public string[] MismatchSelection { get; set; } = [];

    public List<string[]> ReportedMismatches { get; } = [];

    /// <summary>The QR code each sign-in prompt showed; null for approval in the Steam Mobile app.</summary>
    public List<string?> QrCodes { get; } = [];

    /// <summary>Closes the sign-in prompt: true as the user clicking Cancel, false as any other close.</summary>
    public TaskCompletionSource<bool> CloseSignInPrompt { get; } = new();

    public HostCallbacks ToCallbacks() => new()
    {
      requestSteamGuard = () =>
      {
        Calls.Add("requestSteamGuard");
        return Task.FromResult(Code);
      },
      request2FA = () =>
      {
        Calls.Add("request2FA");
        return Task.FromResult(Code);
      },
      reportMismatch = files =>
      {
        ReportedMismatches.Add(files);
        return Task.FromResult(MismatchSelection);
      },
      confirmSignIn = qrCode =>
      {
        Calls.Add("confirmSignIn");
        QrCodes.Add(qrCode);
        return CloseSignInPrompt.Task;
      },
      endSignInConfirmation = () =>
      {
        Calls.Add("endSignInConfirmation");
        return Task.CompletedTask;
      },
      recordSignIn = (accountName, loginToken, guardData) =>
      {
        RecordedSignIns.Add((accountName, loginToken, guardData));
        return Task.CompletedTask;
      },
      forgetLoginToken = accountName =>
      {
        Calls.Add($"forgetLoginToken {accountName}");
        return Task.CompletedTask;
      },
    };

    /// <summary>The sign-ins the downloader asked the host to remember.</summary>
    public List<(string accountName, string? loginToken, string? guardData)> RecordedSignIns { get; } = [];
  }
}
