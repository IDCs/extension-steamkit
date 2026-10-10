using DepotDownloader;

namespace DepotDownloaderNative.Tests
{
  public class DepotResolutionTests
  {
    private const uint AppId = 489830;

    [Fact]
    public void FailsWhenARequestedDepotIsNotProvided()
    {
      var failure = Assert.Throws<ContentDownloaderException>(
        () => Exec.RequireResolvedDepots(AppId, [489831, 489833], [489831], requestedDepots: true, anonymous: false));

      Assert.Contains("489833", failure.Message);
    }

    [Fact]
    public void FailsWhenNoDepotIsProvided()
    {
      Assert.Throws<ContentDownloaderException>(
        () => Exec.RequireResolvedDepots(AppId, [489831, 489832], [], requestedDepots: false, anonymous: false));
    }

    [Fact]
    public void AsksToSignInWhenSignedInAnonymouslyAndARequestedDepotIsNotProvided()
    {
      // Steam lists an owned game's app info anonymously, but keeps its depots to accounts that own it.
      Assert.Throws<ContentDownloaderAccountException>(
        () => Exec.RequireResolvedDepots(AppId, [489833], [], requestedDepots: true, anonymous: true));
    }

    [Fact]
    public void AsksToSignInWhenSignedInAnonymouslyAndNoDepotIsProvided()
    {
      Assert.Throws<ContentDownloaderAccountException>(
        () => Exec.RequireResolvedDepots(AppId, [489831, 489832], [], requestedDepots: false, anonymous: true));
    }

    [Fact]
    public void SkipsADiscoveredDepotTheAccountCannotUse()
    {
      // An app's depot list includes DLC the account may not own.
      Exec.RequireResolvedDepots(AppId, [489831, 489832], [489831], requestedDepots: false, anonymous: false);
    }

    [Fact]
    public void AcceptsEveryRequestedDepot()
    {
      Exec.RequireResolvedDepots(AppId, [489831, 489833], [489833, 489831], requestedDepots: true, anonymous: false);
    }
  }
}
