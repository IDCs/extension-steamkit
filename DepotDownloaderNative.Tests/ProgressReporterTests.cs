using DepotDownloader;

namespace DepotDownloaderNative.Tests
{
  public class ProgressReporterTests
  {
    private readonly List<int> mReported = [];

    private ProgressReporter Reporter(Func<Task>? wait = null) => new(async percent =>
    {
      await (wait?.Invoke() ?? Task.CompletedTask);
      mReported.Add(percent);
    });

    [Fact]
    public async Task ReportsEachWholePercentOnce()
    {
      var reporter = Reporter();

      reporter.Report(10, 1000);
      reporter.Report(15, 1000);
      reporter.Report(20, 1000);
      reporter.Report(1000, 1000);
      await reporter.CompleteAsync();

      Assert.Equal([1, 2, 100], mReported);
    }

    [Fact]
    public async Task ReportsWithoutWaitingForTheHost()
    {
      var hostBusy = new TaskCompletionSource();
      var reporter = Reporter(() => hostBusy.Task);

      reporter.Report(1, 2);
      reporter.Report(2, 2);

      Assert.Empty(mReported);
      hostBusy.SetResult();
      await reporter.CompleteAsync();
      Assert.Equal([50, 100], mReported);
    }

    [Fact]
    public async Task KeepsReportingAfterTheHostFails()
    {
      var calls = 0;
      var reporter = new ProgressReporter(percent =>
      {
        calls++;
        return percent == 50 ? Task.FromException(new TimeoutException()) : Task.CompletedTask;
      });

      reporter.Report(1, 2);
      reporter.Report(2, 2);
      await reporter.CompleteAsync();

      Assert.Equal(2, calls);
    }

    [Fact]
    public async Task IgnoresADownloadOfNothing()
    {
      var reporter = Reporter();

      reporter.Report(0, 0);
      await reporter.CompleteAsync();

      Assert.Empty(mReported);
    }
  }
}
