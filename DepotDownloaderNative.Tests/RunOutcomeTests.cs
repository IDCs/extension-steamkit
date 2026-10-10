using System.Net.Http;
using DepotDownloader;

namespace DepotDownloaderNative.Tests
{
  public class RunOutcomeTests
  {
    [Fact]
    public void ReportsACancelledSignIn() =>
      Assert.Equal(RunOutcome.Cancelled, RunOutcome.Of(new SignInCancelledException()));

    [Fact]
    public void ReportsAnAppTheAccountDoesNotOwn() =>
      Assert.Equal(RunOutcome.AccessDenied, RunOutcome.Of(new ContentDownloaderAccountException("App 489830 is not available from this account.")));

    [Fact]
    public void ReportsAFailedSignIn() =>
      Assert.Equal(RunOutcome.SignInFailed, RunOutcome.Of(new SignInFailedException("Unable to sign in to Steam")));

    [Theory]
    [MemberData(nameof(UnreachableSteam))]
    public void ReportsSteamOutOfReach(Exception exception) =>
      Assert.Equal(RunOutcome.SteamUnreachable, RunOutcome.Of(exception));

    public static TheoryData<Exception> UnreachableSteam() =>
    [
      new SteamUnreachableException("Could not connect to Steam"),
      new HttpRequestException("No such host is known."),
    ];

    [Fact]
    public void ReportsADownloadTheDownloaderRefused() =>
      Assert.Equal(RunOutcome.Failed, RunOutcome.Of(new ContentDownloaderException("Depot 1 not listed for app 2")));

    [Fact]
    public void LeavesAnUnexpectedExceptionUnclassified() =>
      Assert.Null(RunOutcome.Of(new NullReferenceException()));

    [Fact]
    public async Task HandsAnExpectedFailureToTheHostWithItsMessage()
    {
      var result = await NativeApi.RunOffJsThread(
        () => throw new ContentDownloaderAccountException("App 489830 is not available from this account."));

      Assert.Equal(RunOutcome.AccessDenied, result.Outcome);
      Assert.Equal("App 489830 is not available from this account.", result.Message);
    }

    [Fact]
    public async Task ThrowsAnUnexpectedFailure()
    {
      await Assert.ThrowsAsync<NullReferenceException>(
        () => NativeApi.RunOffJsThread(() => throw new NullReferenceException()));
    }
  }
}
