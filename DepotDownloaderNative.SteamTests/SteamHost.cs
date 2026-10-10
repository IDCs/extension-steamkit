using Common;
using DepotDownloader;

namespace DepotDownloaderNative.SteamTests
{
  /// <summary>A host for real Steam runs, with its own install directory and recorded answers.</summary>
  internal sealed class SteamHost : IDisposable
  {
    public string InstallDirectory { get; } = Directory.CreateTempSubdirectory("steamkit-").FullName;

    /// <summary>Whether to restore the mismatched files the downloader reports.</summary>
    public bool RestoreMismatches { get; set; }

    public List<string[]> ReportedMismatches { get; } = [];

    public string PathOf(string fileName) => Path.Combine(InstallDirectory, fileName);

    public HostCallbacks ToCallbacks() => new()
    {
      reportMismatch = files =>
      {
        ReportedMismatches.Add(files);
        return Task.FromResult(RestoreMismatches ? files : []);
      },
      reportProgress = _ => Task.CompletedTask,
    };

    /// <summary>Verifies the named files of the test app against its manifest.</summary>
    public Task Verify(params string[] fileNames) =>
      NativeApi.Run(new RunParameters
      {
        AppId = SteamApp.AppId,
        ManifestOnly = true,
        VerifyAll = true,
        InstallDirectory = InstallDirectory,
        FileList = string.Join('\n', fileNames),
      }, ToCallbacks()).WaitAsync(TimeSpan.FromMinutes(2));

    public void Dispose()
    {
      Directory.Delete(InstallDirectory, recursive: true);
    }
  }
}
