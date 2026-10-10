using DepotDownloader;
using SteamKit2;

namespace DepotDownloaderNative.Tests
{
  public sealed class LocalVerificationTests : IDisposable
  {
    private readonly string mInstallDirectory = Directory.CreateTempSubdirectory("steamkit-").FullName;
    private readonly List<DepotManifest.FileData> mManifest = [];

    public LocalVerificationTests()
    {
      Exec.BeginRun(new FakeHost().ToCallbacks(), verifying: true);
    }

    public void Dispose() => Directory.Delete(mInstallDirectory, recursive: true);


    /// <summary>Lists a file in the manifest with the given content, and installs it as given.</summary>
    private void Install(string name, string manifestContent, string installedContent)
    {
      mManifest.Add(TestManifest.File(name, manifestContent));
      File.WriteAllText(Path.Combine(mInstallDirectory, name), installedContent);
    }

    private List<string> Mismatches() =>
      LocalVerification.FindMismatches(mInstallDirectory, mManifest).Select(f => f.FileName).ToList();

    [Fact]
    public void ReportsAFileWhoseContentDiffers()
    {
      Install("a.bsa", "original", "modified");

      Assert.Equal(["a.bsa"], Mismatches());
    }

    [Fact]
    public void ReportsAFileWhoseSizeDiffers()
    {
      Install("a.bsa", "original", "much longer content");

      Assert.Equal(["a.bsa"], Mismatches());
    }

    [Fact]
    public void StopsCheckingFilesOnceCancelled()
    {
      Install("a.bsa", "original", "modified");

      Assert.ThrowsAny<OperationCanceledException>(
        () => LocalVerification.FindMismatches(mInstallDirectory, mManifest, new CancellationToken(canceled: true)));
    }

    [Fact]
    public void StopsHashingAFileOnceCancelled()
    {
      Install("a.bsa", "original", "modified");

      Assert.ThrowsAny<OperationCanceledException>(() => LocalVerification.Matches(
        Path.Combine(mInstallDirectory, "a.bsa"), mManifest[0], new CancellationToken(canceled: true)));
    }

    [Fact]
    public void LeavesAMatchingFileAlone()
    {
      Install("a.bsa", "original", "original");

      Assert.Empty(Mismatches());
    }

    [Fact]
    public void LeavesAnInstalledFileTheManifestDoesNotListAlone()
    {
      Install("a.bsa", "original", "original");
      File.WriteAllText(Path.Combine(mInstallDirectory, "mod.esp"), "a mod");

      Assert.Empty(Mismatches());
    }

    [Fact]
    public void ReportsAMissingFileOfAnInstalledDepot()
    {
      Install("a.bsa", "original", "original");
      mManifest.Add(TestManifest.File("b.bsa", "original"));

      Assert.Equal(["b.bsa"], Mismatches());
    }

    [Fact]
    public void LeavesADepotThatIsNotInstalledAlone()
    {
      // Steam installs shared redistributables elsewhere, and leaves out DLC the user turned off.
      mManifest.Add(TestManifest.File("_CommonRedist/vcredist.exe", "original"));

      Assert.Empty(Mismatches());
    }

    [Fact]
    public void ChecksOnlyTheListedFilesWhenTheRunHasAFileList()
    {
      Install("a.bsa", "original", "modified");
      Install("b.bsa", "original", "modified");
      Exec.ApplyFileList(["b.bsa"]);

      Assert.Equal(["b.bsa"], Mismatches());
    }

    [Fact]
    public void ReportsMismatchesInManifestOrder()
    {
      var names = Enumerable.Range(0, 64).Select(i => $"{i}.bsa").ToList();
      names.ForEach(name => Install(name, "original", "modified"));

      Assert.Equal(names, Mismatches());
    }

    [Fact]
    public void CollectsTheMismatchesOfEveryDepotTheRunChecks()
    {
      var verification = new LocalVerification();
      Install("a.bsa", "original", "modified");
      verification.Check(mInstallDirectory, mManifest);
      mManifest.Clear();
      Install("b.bsa", "original", "modified");

      verification.Check(mInstallDirectory, mManifest);

      Assert.Equal(["a.bsa", "b.bsa"], verification.FindMismatches().Select(f => f.FileName));
    }

    [Fact]
    public void ChecksAFileSeveralDepotsListAgainstTheLastOne()
    {
      // A later depot, such as an update or language depot, overrides an earlier one's copy.
      var verification = new LocalVerification();
      File.WriteAllText(Path.Combine(mInstallDirectory, "data.bin"), "patched");
      verification.Check(mInstallDirectory, [TestManifest.File("data.bin", "original")]);

      verification.Check(mInstallDirectory, [TestManifest.File("data.bin", "patched")]);

      Assert.Empty(verification.FindMismatches());
    }

    [Fact]
    public void ChecksTheFilesOnlyAnEarlierDepotLists()
    {
      var verification = new LocalVerification();
      File.WriteAllText(Path.Combine(mInstallDirectory, "data.bin"), "patched");
      File.WriteAllText(Path.Combine(mInstallDirectory, "base.bin"), "modified");
      verification.Check(mInstallDirectory, [TestManifest.File("data.bin", "original"), TestManifest.File("base.bin", "original")]);

      verification.Check(mInstallDirectory, [TestManifest.File("data.bin", "patched")]);

      Assert.Equal(["base.bin"], verification.FindMismatches().Select(f => f.FileName));
    }
  }
}
