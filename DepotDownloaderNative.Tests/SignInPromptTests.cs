using DepotDownloader;

namespace DepotDownloaderNative.Tests
{
  public class SignInPromptTests
  {
    private static readonly byte[] PngSignature = [0x89, (byte)'P', (byte)'N', (byte)'G'];

    private readonly FakeHost mHost = new();
    private readonly HostAuthenticator mAuthenticator;

    public SignInPromptTests()
    {
      mAuthenticator = new HostAuthenticator(mHost.ToCallbacks());
    }

    /// <summary>SteamKit2's poll for a Steam Mobile app account: asks to wait for approval, then waits.</summary>
    private async Task<string> WaitForApproval(Task approved, CancellationToken cancellation)
    {
      Assert.True(await mAuthenticator.AcceptDeviceConfirmationAsync());
      return await WaitForSignIn(approved, cancellation);
    }

    private static async Task<string> WaitForSignIn(Task signedIn, CancellationToken cancellation)
    {
      await signedIn.WaitAsync(cancellation);
      return "signed in";
    }

    [Fact]
    public async Task ShowsTheApprovalPromptWhileSteamWaits()
    {
      var approval = new TaskCompletionSource();

      var signIn = mAuthenticator.PollAsync(token => WaitForApproval(approval.Task, token));

      Assert.Equal(["confirmSignIn"], mHost.Calls);
      Assert.Equal([null], mHost.QrCodes);
      approval.SetResult();
      Assert.Equal("signed in", await signIn);
    }

    [Fact]
    public async Task KnowsASignInIsBeingWaitedOnUntilItEnds()
    {
      var approval = new TaskCompletionSource();
      Assert.False(mAuthenticator.Polling);

      var signIn = mAuthenticator.PollAsync(token => WaitForApproval(approval.Task, token));

      Assert.True(mAuthenticator.Polling);
      approval.SetResult();
      await signIn;
      Assert.False(mAuthenticator.Polling);
    }

    [Fact]
    public async Task DismissesThePromptOnceApproved()
    {
      await mAuthenticator.PollAsync(token => WaitForApproval(Task.CompletedTask, token));

      Assert.Equal(["confirmSignIn", "endSignInConfirmation"], mHost.Calls);
    }

    [Fact]
    public async Task StopsWaitingWhenTheUserCancels()
    {
      var polling = CancellationToken.None;
      var signIn = mAuthenticator.PollAsync(token =>
      {
        polling = token;
        return WaitForApproval(new TaskCompletionSource().Task, token);
      });

      mHost.CloseSignInPrompt.SetResult(true);

      await Assert.ThrowsAsync<SignInCancelledException>(() => signIn);
      Assert.True(polling.IsCancellationRequested);
      Assert.True(mAuthenticator.SignInCancelled);
      Assert.Equal(["confirmSignIn", "endSignInConfirmation"], mHost.Calls);
    }

    [Fact]
    public async Task KeepsWaitingWhenThePromptClosesWithoutACancel()
    {
      var approval = new TaskCompletionSource();
      var signIn = mAuthenticator.PollAsync(token => WaitForApproval(approval.Task, token));

      mHost.CloseSignInPrompt.SetResult(false);
      await Task.Delay(50);
      approval.SetResult();

      Assert.Equal("signed in", await signIn);
    }

    [Fact]
    public async Task DismissesThePromptWhenSigningInFails()
    {
      var signIn = mAuthenticator.PollAsync<string>(async token =>
      {
        await WaitForApproval(Task.CompletedTask, token);
        throw new InvalidOperationException("Steam rejected the sign-in");
      });

      await Assert.ThrowsAsync<InvalidOperationException>(() => signIn);
      Assert.Equal(["confirmSignIn", "endSignInConfirmation"], mHost.Calls);
    }

    [Fact]
    public async Task SignsInWithACodeWithoutTheApprovalPrompt()
    {
      Assert.Equal("signed in", await mAuthenticator.PollAsync(_ => Task.FromResult("signed in")));

      Assert.Empty(mHost.Calls);
    }

    [Fact]
    public void ShowsTheQrCodeAsAnImage()
    {
      mAuthenticator.ShowQrCode("https://s.team/q/1/1234567890");

      var qrCode = Assert.Single(mHost.QrCodes)!;
      const string DataUrlPrefix = "data:image/png;base64,";
      Assert.StartsWith(DataUrlPrefix, qrCode);
      Assert.Equal(PngSignature, Convert.FromBase64String(qrCode[DataUrlPrefix.Length..])[..PngSignature.Length]);
    }

    [Fact]
    public async Task StopsWaitingWhenTheUserCancelsTheQrCodeShownBeforeSteamWaits()
    {
      // Steam shows the first QR code as the sign-in starts, before it polls.
      mAuthenticator.ShowQrCode("https://s.team/q/1/1234567890");
      var signIn = mAuthenticator.PollAsync(token => WaitForSignIn(new TaskCompletionSource().Task, token));

      mHost.CloseSignInPrompt.SetResult(true);

      await Assert.ThrowsAsync<SignInCancelledException>(() => signIn.WaitAsync(TimeSpan.FromSeconds(5)));
      Assert.Equal(["confirmSignIn", "endSignInConfirmation"], mHost.Calls);
    }
  }
}
