namespace Common
{
  /// <summary>How the user signs in to Steam.</summary>
  /// <remarks>Only strings cross from JS as null, so a cancelled prompt answers with a flag.</remarks>
  public class Credentials
  {
    public bool Cancelled { get; set; }
    /// <summary>Sign in by scanning a QR code with the Steam Mobile app, without a password.</summary>
    public bool UseQrCode { get; set; }
    /// <summary>Keep the sign-in, so later runs sign in without asking.</summary>
    public bool Remember { get; set; }
    public string Username { get; set; } = null!;
    public string Password { get; set; } = null!;
  }

  /// <summary>Callbacks a run makes into the host to prompt the user, and the waits on them.</summary>
  /// <remarks>A code prompt the user cancels answers null.</remarks>
  public class HostCallbacks
  {
    public Func<Task<Credentials>> requestCredentials { get; set; } = null!;
    public Func<Task<string?>> requestSteamGuard { get; set; } = null!;
    public Func<Task<string?>> request2FA { get; set; } = null!;
    /// <summary>Resolves to the reported files the user selects to restore.</summary>
    public Func<string[], Task<string[]>> reportMismatch { get; set; } = null!;
    /// <summary>
    /// Shows the sign-in prompt with a QR code data URL, or null to approve in the Steam Mobile app; another
    /// call replaces it. Completes when the prompt closes, with whether the user cancelled.
    /// </summary>
    public Func<string?, Task<bool>> confirmSignIn { get; set; } = null!;
    /// <summary>Dismisses the prompt <see cref="confirmSignIn"/> showed.</summary>
    public Func<Task> endSignInConfirmation { get; set; } = null!;
    /// <summary>Called with the download's progress in percent.</summary>
    public Func<int, Task> reportProgress { get; set; } = null!;
    /// <summary>
    /// Called with a sign-in to keep: the account, its token when the user asked to be remembered, and Steam
    /// Guard's record that this machine passed it. A null value clears the kept one.
    /// </summary>
    public Func<string, string?, string?, Task> recordSignIn { get; set; } = null!;
    /// <summary>Called when Steam rejects the sign-in token kept for an account.</summary>
    public Func<string, Task> forgetLoginToken { get; set; } = null!;

    // How long a call that needs no answer from the user may take.
    private static readonly TimeSpan HostCallTimeout = TimeSpan.FromSeconds(5);

    // The user takes as long as they need to answer a prompt; cancelling the run stops the wait.

    public Task<Credentials> RequestCredentials(CancellationToken cancellation = default) =>
      requestCredentials().WaitAsync(cancellation);

    public Task<string?> RequestSteamGuard(CancellationToken cancellation = default) =>
      requestSteamGuard().WaitAsync(cancellation);

    public Task<string?> Request2FA(CancellationToken cancellation = default) => request2FA().WaitAsync(cancellation);

    public Task<string[]> ReportMismatch(string[] invalidFiles, CancellationToken cancellation = default) =>
      reportMismatch(invalidFiles).WaitAsync(cancellation);

    /// <remarks>The sign-in expires on its own.</remarks>
    public Task<bool> ConfirmSignIn(string? qrCode) => confirmSignIn(qrCode);

    public async Task EndSignInConfirmation()
    {
      try
      {
        await endSignInConfirmation().WaitAsync(HostCallTimeout);
      }
      catch (Exception e)
      {
        Console.WriteLine("exception in end sign-in confirmation: {0}", e);
      }
    }

    public Task ReportProgress(int percent) => reportProgress(percent).WaitAsync(HostCallTimeout);

    public Task RecordSignIn(string accountName, string? loginToken, string? guardData) =>
      recordSignIn(accountName, loginToken, guardData).WaitAsync(HostCallTimeout);

    public Task ForgetLoginToken(string accountName) => forgetLoginToken(accountName).WaitAsync(HostCallTimeout);
  }
}
