namespace DepotDownloaderNative.Tests
{
  public class SecretProtectionTests
  {
    [Fact]
    public void ProtectsSecretsOnWindows() => Assert.Equal(OperatingSystem.IsWindows(), NativeApi.CanProtect());

    // DPAPI is Windows only.

    [Fact]
    public void ReadsBackWhatItProtected()
    {
      if (!OperatingSystem.IsWindows())
      {
        return;
      }

      var protectedToken = NativeApi.Protect("eyJ0eXAiOiJKV1QifQ.refresh-token");

      Assert.NotEqual("eyJ0eXAiOiJKV1QifQ.refresh-token", protectedToken);
      Assert.Equal("eyJ0eXAiOiJKV1QifQ.refresh-token", NativeApi.Unprotect(protectedToken));
    }

    [Fact]
    public void ReadsNothingBackFromATamperedSecret()
    {
      if (!OperatingSystem.IsWindows())
      {
        return;
      }

      Assert.Null(NativeApi.Unprotect(Convert.ToBase64String([1, 2, 3, 4])));
      Assert.Null(NativeApi.Unprotect("not base64"));
    }
  }
}
