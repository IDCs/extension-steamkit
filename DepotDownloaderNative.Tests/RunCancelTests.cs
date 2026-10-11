using Common;
using DepotDownloader;

namespace DepotDownloaderNative.Tests
{
  public class RunCancelTests
  {
    [Fact]
    public async Task EndsARunCancelledWhileItRunsAsCancelled()
    {
      using var cancellation = new CancellationTokenSource();
      var running = new TaskCompletionSource();

      var run = NativeApi.RunOffJsThread(async () =>
      {
        running.SetResult();
        await Task.Delay(Timeout.Infinite, cancellation.Token);
        return null;
      }, cancellation.Token);
      await running.Task;
      cancellation.Cancel();

      Assert.Equal(RunOutcome.Cancelled, (await run.WaitAsync(TimeSpan.FromSeconds(5))).Outcome);
    }

    [Fact]
    public async Task EndsAsCancelledWhateverTheDownloaderThrowsOnceCancelled()
    {
      using var cancellation = new CancellationTokenSource();

      var result = await NativeApi.RunOffJsThread(() =>
      {
        cancellation.Cancel();
        throw new ContentDownloaderException("Unable to download manifest");
      }, cancellation.Token);

      Assert.Equal(RunOutcome.Cancelled, result.Outcome);
    }

    [Fact]
    public async Task ReportsADownloadTheDownloaderGaveUpOnAsFailed()
    {
      var result = await NativeApi.RunOffJsThread(() => throw new ContentDownloaderException(Exec.DownloaderGaveUp));

      Assert.Equal(RunOutcome.Failed, result.Outcome);
      Assert.Equal(Exec.DownloaderGaveUp, result.Message);
    }

    [Fact]
    public async Task ReportsARequestSteamTimedOutAsFailed()
    {
      var result = await NativeApi.RunOffJsThread(() => throw new TaskCanceledException("Steam did not answer in time"));

      Assert.Equal(RunOutcome.Failed, result.Outcome);
      Assert.Equal("Steam did not answer in time", result.Message);
    }

    [Fact]
    public async Task HandsBackTheFilesAVerificationRestored()
    {
      var result = await NativeApi.RunOffJsThread(() => Task.FromResult<string[]?>(["a.bsa"]));

      Assert.Equal(RunOutcome.Completed, result.Outcome);
      Assert.True(result.FilesDiffered);
      Assert.Equal(new[] { "a.bsa" }, result.RestoredFiles);
    }

    [Fact]
    public async Task HandsBackNoFilesForARunWithNothingToRestore()
    {
      var result = await NativeApi.RunOffJsThread(() => Task.FromResult<string[]?>(null));

      Assert.Equal(RunOutcome.Completed, result.Outcome);
      Assert.False(result.FilesDiffered);
      Assert.Empty(result.RestoredFiles);
    }

    [Fact]
    public async Task NeverStartsARunCancelledBeforeItsTurn()
    {
      var started = false;

      var result = await NativeApi.RunOffJsThread(() =>
      {
        started = true;
        return Task.FromResult<string[]?>(null);
      }, new CancellationToken(canceled: true));

      Assert.False(started);
      Assert.Equal(RunOutcome.Cancelled, result.Outcome);
    }

    [Fact]
    public async Task EndsTheSignInPromptWhenTheRunIsCancelled()
    {
      using var cancellation = new CancellationTokenSource();
      var host = new HostCallbacks { requestCredentials = () => new TaskCompletionSource<Credentials>().Task };

      var prompt = host.RequestCredentials(cancellation.Token);
      cancellation.Cancel();

      await Assert.ThrowsAnyAsync<OperationCanceledException>(() => prompt.WaitAsync(TimeSpan.FromSeconds(5)));
    }

    [Fact]
    public async Task EndsTheRestorePromptWhenTheRunIsCancelled()
    {
      using var cancellation = new CancellationTokenSource();
      var host = new HostCallbacks { reportMismatch = _ => new TaskCompletionSource<string[]>().Task };

      var prompt = host.ReportMismatch(["a.bsa"], cancellation.Token);
      cancellation.Cancel();

      await Assert.ThrowsAnyAsync<OperationCanceledException>(() => prompt.WaitAsync(TimeSpan.FromSeconds(5)));
    }

    [Fact]
    public async Task EndsASteamGuardPromptWhenTheRunIsCancelled()
    {
      using var cancellation = new CancellationTokenSource();
      var host = new FakeHost().ToCallbacks();
      host.requestSteamGuard = () => new TaskCompletionSource<string?>().Task;
      var authenticator = new HostAuthenticator(host, cancellation.Token);

      var prompt = authenticator.GetEmailCodeAsync("user@example.com", false);
      cancellation.Cancel();

      await Assert.ThrowsAnyAsync<OperationCanceledException>(() => prompt.WaitAsync(TimeSpan.FromSeconds(5)));
    }

    [Fact]
    public async Task StopsWaitingForSignInApprovalWhenTheRunIsCancelled()
    {
      using var cancellation = new CancellationTokenSource();
      var authenticator = new HostAuthenticator(new FakeHost().ToCallbacks(), cancellation.Token);

      var signIn = authenticator.PollAsync(async token =>
      {
        await Task.Delay(Timeout.Infinite, token);
        return "signed in";
      });
      cancellation.Cancel();

      await Assert.ThrowsAnyAsync<OperationCanceledException>(() => signIn.WaitAsync(TimeSpan.FromSeconds(5)));
    }

    [Fact]
    public void GivesTheDownloaderTheCurrentRunsCancellation()
    {
      using var cancellation = new CancellationTokenSource();

      Exec.BeginRun(new FakeHost().ToCallbacks(), cancellation: cancellation.Token);

      Assert.Equal(cancellation.Token, Exec.Cancellation);
    }

    [Fact]
    public void LetsGoOfTheCancellationOnceTheRunEnds()
    {
      using var cancellation = new CancellationTokenSource();
      Exec.BeginRun(new FakeHost().ToCallbacks(), cancellation: cancellation.Token);

      Exec.EndRun();

      Assert.Equal(CancellationToken.None, Exec.Cancellation);
    }
  }
}
