using DepotDownloader;

namespace DepotDownloaderNative.Tests
{
  public class RememberedAccountTests
  {
    private readonly FakeHost mHost = new();

    public RememberedAccountTests()
    {
      Exec.BeginRun(mHost.ToCallbacks());
    }

    [Fact]
    public void SignsInAsTheRememberedAccountWithItsToken()
    {
      var username = Exec.UseRememberedAccount(new RunParameters
      {
        Account = "player",
        LoginToken = "refresh-token",
        GuardData = "guard",
      });

      Assert.Equal("player", username);
      Assert.Equal("refresh-token", AccountSettingsStore.Instance.LoginTokens["player"]);
      Assert.Equal("guard", AccountSettingsStore.Instance.GuardData["player"]);
      Assert.True(ContentDownloader.Config.RememberPassword);
    }

    [Fact]
    public void AsksWhoToSignInAsWithoutARememberedToken()
    {
      var username = Exec.UseRememberedAccount(new RunParameters { Account = "player", GuardData = "guard" });

      Assert.Null(username);
      // Steam Guard still recognises this machine if the user signs in as that account.
      Assert.Equal("guard", AccountSettingsStore.Instance.GuardData["player"]);
    }

    [Fact]
    public void KeepsTheAccountStoreInMemoryOnly()
    {
      Exec.UseRememberedAccount(new RunParameters { Account = "player", LoginToken = "refresh-token" });

      AccountSettingsStore.Save();

      Assert.False(AccountSettingsStore.IsSaved);
    }

    [Fact]
    public void HandsTheHostTheSignInToRememberWhenAskedTo()
    {
      Exec.UseRememberedAccount(new RunParameters { RememberPassword = true });

      Exec.SignedIn("player", "refresh-token", "guard");

      Assert.Equal([("player", "refresh-token", "guard")], mHost.RecordedSignIns);
    }

    [Fact]
    public void HandsTheHostNoTokenUnlessAskedToRemember()
    {
      Exec.UseRememberedAccount(new RunParameters());

      Exec.SignedIn("player", "refresh-token", "guard");

      Assert.Equal([("player", (string?)null, "guard")], mHost.RecordedSignIns);
    }

    [Fact]
    public void LogsAnAccountNameAnonymised()
    {
      Assert.Equal("p***", Exec.Anonymise("player"));
    }
  }
}
