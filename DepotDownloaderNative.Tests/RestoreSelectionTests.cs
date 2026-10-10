using DepotDownloader;

namespace DepotDownloaderNative.Tests
{
  public sealed class RestoreSelectionTests : IDisposable
  {
    private readonly string mInstallDirectory = Directory.CreateTempSubdirectory("steamkit-").FullName;
    private readonly FakeHost mHost = new();

    public RestoreSelectionTests()
    {
      Exec.BeginRun(mHost.ToCallbacks(), verifying: true);
    }

    public void Dispose() => Directory.Delete(mInstallDirectory, recursive: true);

    /// <summary>Checks a depot of one file whose installed copy is modified.</summary>
    private void CheckModifiedDepot(string name)
    {
      File.WriteAllText(Path.Combine(mInstallDirectory, name), "modified");
      Exec.Verification!.Check(mInstallDirectory, [TestManifest.File(name, "original")]);
    }

    [Fact]
    public async Task AsksOnceAboutTheMismatchesOfEveryDepot()
    {
      CheckModifiedDepot("a.bsa");
      CheckModifiedDepot("b.bsa");

      await Exec.SelectFilesToRestoreAsync();

      Assert.Equal([["a.bsa", "b.bsa"]], mHost.ReportedMismatches);
    }

    [Fact]
    public async Task DownloadsOnlyTheFilesTheUserSelects()
    {
      CheckModifiedDepot("a.bsa");
      CheckModifiedDepot("b.bsa");
      mHost.MismatchSelection = ["b.bsa"];

      Assert.True(await Exec.SelectFilesToRestoreAsync());

      Assert.Null(Exec.Verification);
      Assert.True(ContentDownloader.TestIsFileIncluded("b.bsa"));
      Assert.False(ContentDownloader.TestIsFileIncluded("a.bsa"));
    }

    [Fact]
    public async Task RestoresNothingWhenTheUserSelectsNoFiles()
    {
      CheckModifiedDepot("a.bsa");

      Assert.False(await Exec.SelectFilesToRestoreAsync());
    }

    [Fact]
    public async Task AsksNothingWhenEveryFileMatches()
    {
      Assert.False(await Exec.SelectFilesToRestoreAsync());

      Assert.Empty(mHost.ReportedMismatches);
    }
  }
}
