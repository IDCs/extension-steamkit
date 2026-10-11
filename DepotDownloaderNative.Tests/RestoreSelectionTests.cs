using Common;
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

    private static Task<string[]?> SelectFilesToRestore() => Exec.SelectFilesToRestoreAsync();

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

      await SelectFilesToRestore();

      Assert.Equal([["a.bsa", "b.bsa"]], mHost.ReportedMismatches);
    }

    [Fact]
    public async Task DownloadsOnlyTheFilesTheUserSelects()
    {
      CheckModifiedDepot("a.bsa");
      CheckModifiedDepot("b.bsa");
      mHost.MismatchSelection = ["b.bsa"];

      Assert.Equal(new[] { "b.bsa" }, await SelectFilesToRestore());

      Assert.Null(Exec.Verification);
      Assert.True(ContentDownloader.TestIsFileIncluded("b.bsa"));
      Assert.False(ContentDownloader.TestIsFileIncluded("a.bsa"));
    }

    [Fact]
    public async Task RestoresNothingWhenTheUserSelectsNoFiles()
    {
      CheckModifiedDepot("a.bsa");

      Assert.Equal(new string[0], await SelectFilesToRestore());
    }

    [Fact]
    public async Task AsksNothingWhenEveryFileMatches()
    {
      Assert.Null(await SelectFilesToRestore());

      Assert.Empty(mHost.ReportedMismatches);
    }
  }
}
