using DepotDownloader;

namespace DepotDownloaderNative.Tests
{
  public class SignInCancelTests
  {
    private readonly FakeHost mHost = new() { Code = null };

    public SignInCancelTests()
    {
      Exec.BeginRun(mHost.ToCallbacks());
    }

    [Fact]
    public async Task CancelsTheSignInWhenTheUserCancelsTheTwoFactorPrompt()
    {
      await Assert.ThrowsAsync<SignInCancelledException>(() => Exec.Authenticator.GetDeviceCodeAsync(false));

      Assert.IsType<SignInCancelledException>(Exec.SignInFailure());
    }

    [Fact]
    public async Task CancelsTheSignInWhenTheUserCancelsTheEmailCodePrompt()
    {
      await Assert.ThrowsAsync<SignInCancelledException>(
        () => Exec.Authenticator.GetEmailCodeAsync("user@example.com", false));

      Assert.IsType<SignInCancelledException>(Exec.SignInFailure());
    }

    [Fact]
    public void CancelsTheSignInWhenTheUserCancelsALegacyCodePrompt()
    {
      Assert.Null(Exec.Authenticator.ReadTwoFactorCode());

      Assert.IsType<SignInCancelledException>(Exec.SignInFailure());
    }

    [Fact]
    public void CancelsTheSignInWhenTheUserCancelsALegacyEmailCodePrompt()
    {
      Assert.Null(Exec.Authenticator.ReadEmailCode());

      Assert.IsType<SignInCancelledException>(Exec.SignInFailure());
    }

    [Fact]
    public void ReportsAFailedSignInTheUserDidNotCancel()
    {
      Assert.IsType<SignInFailedException>(Exec.SignInFailure());
    }

    [Fact]
    public void ReportsSteamOutOfReachWhenItNeverConnected()
    {
      Assert.IsType<SteamUnreachableException>(Exec.SignInFailure(couldNotConnect: true));
    }

    [Fact]
    public async Task EndsTheRunQuietlyWhenTheUserCancelsSigningIn()
    {
      var result = await NativeApi.RunOffJsThread(() => throw new SignInCancelledException());

      Assert.Equal(RunOutcome.Cancelled, result.Outcome);
    }

    [Fact]
    public async Task ReportsACompletedRun()
    {
      var result = await NativeApi.RunOffJsThread(() => Task.CompletedTask);

      Assert.Equal(RunOutcome.Completed, result.Outcome);
    }
  }
}
