using DepotDownloader;

namespace DepotDownloaderNative.Tests
{
  public class DepotManifestTests
  {
    [Fact]
    public void PairsEachDepotWithItsManifest()
    {
      var pairs = Exec.DepotManifestIds(new RunParameters
      {
        DepotIdList = [489831, 489833],
        ManifestIdList = ["7848722008564294070", "2289561010626853674"],
      });

      Assert.Equal([(489831u, 7848722008564294070ul), (489833u, 2289561010626853674ul)], pairs);
    }

    [Fact]
    public void UsesTheLatestManifestOfDepotsWithoutOne()
    {
      var pairs = Exec.DepotManifestIds(new RunParameters { DepotIdList = [489831] });

      Assert.Equal([(489831u, ContentDownloader.INVALID_MANIFEST_ID)], pairs);
    }

    [Fact]
    public void RefusesDepotsAndManifestsThatDoNotPairUp()
    {
      Assert.Throws<ContentDownloaderException>(() => Exec.DepotManifestIds(new RunParameters
      {
        DepotIdList = [489831, 489833],
        ManifestIdList = ["7848722008564294070"],
      }));
    }
  }
}
