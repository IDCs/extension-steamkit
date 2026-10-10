using DepotDownloader;

namespace DepotDownloaderNative.Tests
{
  public class SignInRecordTests
  {
    private const string Account = "player";

    /// <summary>An account store that is never saved, leaving the process-wide one as it was.</summary>
    private static AccountSettingsStore UnsavedStore()
    {
      var previous = AccountSettingsStore.Instance;
      AccountSettingsStore.Instance = null;
      AccountSettingsStore.LoadFromFile($"steamkit-test-{Guid.NewGuid()}.config");
      var store = AccountSettingsStore.Instance!;
      AccountSettingsStore.Instance = previous;
      return store;
    }

    [Fact]
    public void KeepsNoSignInTokenUnlessAskedToRemember()
    {
      var store = UnsavedStore();

      Exec.RecordSignIn(store, Account, "refresh-token", newGuardData: null, rememberPassword: false);

      Assert.DoesNotContain(Account, store.LoginTokens.Keys);
    }

    [Fact]
    public void ForgetsASignInTokenKeptBeforeUnlessAskedToRemember()
    {
      var store = UnsavedStore();
      store.LoginTokens[Account] = "earlier-token";

      Exec.RecordSignIn(store, Account, "refresh-token", newGuardData: null, rememberPassword: false);

      Assert.DoesNotContain(Account, store.LoginTokens.Keys);
    }

    [Fact]
    public void KeepsTheSignInTokenWhenAskedToRemember()
    {
      var store = UnsavedStore();

      Exec.RecordSignIn(store, Account, "refresh-token", newGuardData: null, rememberPassword: true);

      Assert.Equal("refresh-token", store.LoginTokens[Account]);
    }

    [Fact]
    public void KeepsSteamGuardMachineData()
    {
      var store = UnsavedStore();

      Exec.RecordSignIn(store, Account, "refresh-token", newGuardData: "guard", rememberPassword: false);

      Assert.Equal("guard", store.GuardData[Account]);
    }

    [Fact]
    public void ForgetsSteamGuardMachineDataSteamNoLongerIssues()
    {
      var store = UnsavedStore();
      store.GuardData[Account] = "earlier-guard";

      Exec.RecordSignIn(store, Account, "refresh-token", newGuardData: null, rememberPassword: false);

      Assert.DoesNotContain(Account, store.GuardData.Keys);
    }
  }
}
