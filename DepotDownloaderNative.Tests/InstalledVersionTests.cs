using DepotDownloader;

namespace DepotDownloaderNative.Tests
{
  public sealed class InstalledVersionTests : IDisposable
  {
    private const uint AppId = 489830;
    private const uint BaseDepotId = 489831;
    private const uint ExecutableDepotId = 489833;
    private const ulong BaseManifestId = 1111;
    private const ulong SteamManifestId = 3333;
    private const ulong DowngradedManifestId = 7848722008564294070;

    private static readonly DateTime SteamUpdated = new(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc);

    private readonly string mLibrary = Directory.CreateTempSubdirectory("steamkit-").FullName;
    private readonly string mInstallDirectory;

    public InstalledVersionTests()
    {
      mInstallDirectory = Path.Combine(mLibrary, "steamapps", "common", "Skyrim Special Edition");
      Directory.CreateDirectory(mInstallDirectory);
    }

    public void Dispose()
    {
      DepotConfigStore.Instance = null;
      Directory.Delete(mLibrary, recursive: true);
    }

    /// <summary>Writes steamkit's record of the installed manifests, as written at the given time.</summary>
    private void RecordInstall(DateTime writtenAt, params (uint depotId, ulong manifestId)[] installed)
    {
      var record = Path.Combine(mInstallDirectory, ContentDownloader.CONFIG_DIR, "depot.config");
      Directory.CreateDirectory(Path.GetDirectoryName(record)!);
      DepotConfigStore.Instance = null;
      DepotConfigStore.LoadFromFile(record);
      foreach (var (depotId, manifestId) in installed)
      {
        DepotConfigStore.Instance!.InstalledManifestIDs[depotId] = manifestId;
      }
      DepotConfigStore.Save();
      DepotConfigStore.Instance = null;
      File.SetLastWriteTimeUtc(record, writtenAt);
    }

    /// <summary>Writes Steam's own install record of the app: when it last updated it, and its depots.</summary>
    private void SteamInstalled(DateTime lastUpdated, params (uint depotId, ulong manifestId)[] installed)
    {
      var depots = string.Concat(installed.Select(depot =>
        $"\t\t\"{depot.depotId}\"\n\t\t{{\n\t\t\t\"manifest\"\t\t\"{depot.manifestId}\"\n\t\t}}\n"));
      var unixSeconds = new DateTimeOffset(lastUpdated).ToUnixTimeSeconds();
      File.WriteAllText(
        Path.Combine(mLibrary, "steamapps", $"appmanifest_{AppId}.acf"),
        $"\"AppState\"\n{{\n\t\"appid\"\t\t\"{AppId}\"\n\t\"LastUpdated\"\t\t\"{unixSeconds}\"\n" +
        $"\t\"InstalledDepots\"\n\t{{\n{depots}\t}}\n" +
        "\t\"SharedDepots\"\n\t{\n\t\t\"228988\"\t\t\"228980\"\n\t}\n}\n");
    }

    private List<(uint, ulong)> ToVerify() => InstalledVersion.ToVerify(mInstallDirectory, AppId);

    [Fact]
    public void VerifiesTheDepotsSteamInstalledAtTheVersionSteamInstalled()
    {
      SteamInstalled(SteamUpdated, (BaseDepotId, BaseManifestId), (ExecutableDepotId, SteamManifestId));

      Assert.Equal([(BaseDepotId, BaseManifestId), (ExecutableDepotId, SteamManifestId)], ToVerify());
    }

    [Fact]
    public void VerifiesAgainstTheVersionSteamkitInstalledAfterSteamsLastUpdate()
    {
      SteamInstalled(SteamUpdated, (BaseDepotId, BaseManifestId), (ExecutableDepotId, SteamManifestId));
      RecordInstall(SteamUpdated.AddDays(1), (ExecutableDepotId, DowngradedManifestId));

      Assert.Equal([(BaseDepotId, BaseManifestId), (ExecutableDepotId, DowngradedManifestId)], ToVerify());
    }

    [Fact]
    public void VerifiesAgainstSteamsVersionOnceSteamUpdatesTheGameAgain()
    {
      RecordInstall(SteamUpdated.AddDays(-1), (ExecutableDepotId, DowngradedManifestId));
      SteamInstalled(SteamUpdated, (ExecutableDepotId, SteamManifestId));

      Assert.Equal([(ExecutableDepotId, SteamManifestId)], ToVerify());
    }

    [Fact]
    public void VerifiesAgainstSteamkitsRecordWhenSteamHasNone()
    {
      RecordInstall(SteamUpdated, (ExecutableDepotId, DowngradedManifestId));

      Assert.Equal([(ExecutableDepotId, DowngradedManifestId)], ToVerify());
    }

    [Fact]
    public void LeavesTheDepotsToTheDownloaderWhenNothingRecordsTheInstall()
    {
      Assert.Empty(ToVerify());
    }

    [Fact]
    public void KeepsSteamsVersionOfADepotSteamkitDidNotFinishInstalling()
    {
      SteamInstalled(SteamUpdated, (ExecutableDepotId, SteamManifestId));
      RecordInstall(SteamUpdated.AddDays(1), (ExecutableDepotId, ContentDownloader.INVALID_MANIFEST_ID));

      Assert.Equal([(ExecutableDepotId, SteamManifestId)], ToVerify());
    }

    [Fact]
    public void LeavesTheDownloadersConfigUnloaded()
    {
      RecordInstall(SteamUpdated, (ExecutableDepotId, DowngradedManifestId));

      ToVerify();

      Assert.Null(DepotConfigStore.Instance);
    }

    [Fact]
    public void LeavesARunningDownloadsConfigInPlace()
    {
      RecordInstall(SteamUpdated, (ExecutableDepotId, DowngradedManifestId));
      DepotConfigStore.LoadFromFile(Path.Combine(mLibrary, "running.config"));
      var running = DepotConfigStore.Instance;

      ToVerify();

      Assert.Same(running, DepotConfigStore.Instance);
    }

    [Fact]
    public void ReportsInstalledManifestsAsDecimalStrings()
    {
      SteamInstalled(SteamUpdated, (ExecutableDepotId, DowngradedManifestId));

      var installed = Assert.Single(NativeApi.InstalledManifests(mInstallDirectory, AppId));

      Assert.Equal(ExecutableDepotId, installed.DepotId);
      Assert.Equal("7848722008564294070", installed.ManifestId);
    }
  }
}
