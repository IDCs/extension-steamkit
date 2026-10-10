namespace DepotDownloaderNative.Tests
{
  public class RunQueueTests
  {
    [Fact]
    public async Task RunsOneDownloaderRunAtATime()
    {
      var firstRunning = new TaskCompletionSource();
      var finishFirst = new TaskCompletionSource();
      var secondStarted = false;

      var first = NativeApi.RunOffJsThread(async () =>
      {
        firstRunning.SetResult();
        await finishFirst.Task;
      });
      await firstRunning.Task;
      var second = NativeApi.RunOffJsThread(() =>
      {
        secondStarted = true;
        return Task.CompletedTask;
      });

      await Task.Delay(50);
      Assert.False(secondStarted);
      finishFirst.SetResult();
      await Task.WhenAll(first, second);
      Assert.True(secondStarted);
    }

    [Fact]
    public async Task StartsTheNextRunAfterOneFails()
    {
      var failed = NativeApi.RunOffJsThread(() => throw new InvalidOperationException("Unable to sign in"));
      await Assert.ThrowsAsync<InvalidOperationException>(() => failed);

      await NativeApi.RunOffJsThread(() => Task.CompletedTask).WaitAsync(TimeSpan.FromSeconds(5));
    }
  }
}
