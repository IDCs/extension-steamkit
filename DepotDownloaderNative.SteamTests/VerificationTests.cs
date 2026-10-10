namespace DepotDownloaderNative.SteamTests
{
  public sealed class VerificationTests : IDisposable
  {
    private readonly SteamHost mHost = new();

    public void Dispose() => mHost.Dispose();

    [Fact]
    public async Task ReportsAFileThatDiffersFromTheManifest()
    {
      File.WriteAllText(mHost.PathOf(SteamApp.SmallFile), "overwritten by a mod");

      await mHost.Verify(SteamApp.SmallFile);

      var reported = Assert.Single(mHost.ReportedMismatches);
      Assert.Equal([SteamApp.SmallFile], reported);
    }

    [Fact]
    public async Task ReportsAFileOfTheRightSizeWithDifferentContent()
    {
      File.WriteAllBytes(mHost.PathOf(SteamApp.SmallFile), new byte[SteamApp.SmallFileSize]);

      await mHost.Verify(SteamApp.SmallFile);

      Assert.Equal([SteamApp.SmallFile], Assert.Single(mHost.ReportedMismatches));
    }

    [Fact]
    public async Task RestoresAFileThatDiffersFromTheManifest()
    {
      File.WriteAllText(mHost.PathOf(SteamApp.SmallFile), "overwritten by a mod");
      mHost.RestoreMismatches = true;

      await mHost.Verify(SteamApp.SmallFile);

      Assert.Equal(SteamApp.SmallFileSize, new FileInfo(mHost.PathOf(SteamApp.SmallFile)).Length);
    }
  }
}
