using DepotDownloader;

namespace DepotDownloaderNative.Tests
{
  public class PendingRequestTests
  {
    [Fact]
    public async Task GivesTheWaitersSteamsAnswer()
    {
      var waiters = new TaskCompletionSource<string>();

      await PendingRequest.SettleAsync(waiters, () => Task.FromResult("AccessDenied"), () => { });

      Assert.Equal("AccessDenied", await waiters.Task.WaitAsync(TimeSpan.FromSeconds(5)));
    }

    [Fact]
    public async Task ReleasesTheWaitersAndForgetsTheRequestWhenItFails()
    {
      var waiters = new TaskCompletionSource<string>();
      var forgotten = false;

      await PendingRequest.SettleAsync<string>(
        waiters, () => throw new TimeoutException(), () => forgotten = true);

      Assert.True(forgotten);
      await Assert.ThrowsAnyAsync<OperationCanceledException>(() => waiters.Task.WaitAsync(TimeSpan.FromSeconds(5)));
    }
  }
}
