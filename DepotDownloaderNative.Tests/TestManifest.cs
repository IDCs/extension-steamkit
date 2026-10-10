using System.Security.Cryptography;
using System.Text;
using SteamKit2;

namespace DepotDownloaderNative.Tests
{
  internal static class TestManifest
  {
    /// <summary>A manifest entry for a file with the given content.</summary>
    public static DepotManifest.FileData File(string name, string content)
    {
      var expected = Encoding.UTF8.GetBytes(content);
      return new DepotManifest.FileData(name, [], default, (ulong)expected.Length, SHA1.HashData(expected), "", false, 0);
    }
  }
}
