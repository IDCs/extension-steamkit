using DepotDownloader;

namespace DepotDownloaderNative.Tests
{
  public class FileListTests
  {
    private const string InstallDirectory = @"C:\Games\Skyrim Special Edition";

    public FileListTests()
    {
      Exec.BeginRun(new FakeHost().ToCallbacks());
    }

    [Fact]
    public void IncludesOnlyListedFiles()
    {
      Exec.ApplyFileList(["Data/Skyrim.esm"]);

      Assert.True(ContentDownloader.TestIsFileIncluded("Data/Skyrim.esm"));
      Assert.False(ContentDownloader.TestIsFileIncluded("Data/Other.esm"));
    }

    [Fact]
    public void MatchesRegexEntries()
    {
      Exec.ApplyFileList([@"regex:^Data/.*\.bsa$"]);

      Assert.True(ContentDownloader.TestIsFileIncluded("Data/Skyrim - Textures.bsa"));
      Assert.False(ContentDownloader.TestIsFileIncluded("Data/Skyrim.esm"));
    }

    [Fact]
    public void ReadsOneFilePerLine()
    {
      Assert.Equal(["Data/Skyrim.esm", "SkyrimSE.exe"], Exec.FileListEntries("Data/Skyrim.esm\r\nSkyrimSE.exe\n", InstallDirectory));
    }

    [Fact]
    public void ReadsAbsolutePathsRelativeToTheInstallDirectory()
    {
      Assert.Equal([@"Data\Skyrim.esm"], Exec.FileListEntries($@"{InstallDirectory}\Data\Skyrim.esm", InstallDirectory));
    }
  }
}
