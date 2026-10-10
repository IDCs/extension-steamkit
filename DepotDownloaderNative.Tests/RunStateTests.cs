using System.Reflection;
using DepotDownloader;

namespace DepotDownloaderNative.Tests
{
  public class RunStateTests
  {
    [Fact]
    public void UsesTheCurrentRunsCallbacks()
    {
      var first = new FakeHost().ToCallbacks();
      var second = new FakeHost().ToCallbacks();

      Exec.BeginRun(first);
      Exec.BeginRun(second);

      Assert.Same(second, Exec.Host);
    }

    [Fact]
    public void StartsEachRunWithEveryFileIncluded()
    {
      Exec.BeginRun(new FakeHost().ToCallbacks());
      Exec.ApplyFileList(["Data/Skyrim.esm"]);

      Exec.BeginRun(new FakeHost().ToCallbacks());

      Assert.True(ContentDownloader.TestIsFileIncluded("workshop/item.bin"));
    }

    [Fact]
    public void StartsEachRunWithAnEmptyFileList()
    {
      Exec.BeginRun(new FakeHost().ToCallbacks());
      Exec.ApplyFileList(["Data/Skyrim.esm"]);

      Exec.BeginRun(new FakeHost().ToCallbacks());

      // Read unconditionally when verifying a manifest, so it must never be left null.
      Assert.NotNull(ContentDownloader.Config.FilesToDownload);
      Assert.Empty(ContentDownloader.Config.FilesToDownload);
    }

    [Fact]
    public void LetsGoOfTheHostOnceTheRunEnds()
    {
      Exec.BeginRun(new FakeHost().ToCallbacks(), verifying: true);

      Exec.EndRun();

      Assert.Null(Exec.Host);
      Assert.Null(Exec.Authenticator);
      Assert.Null(Exec.Progress);
      Assert.Null(Exec.Verification);
    }

    [Fact]
    public void LoadsTheDepotConfigAfreshForEachDownload()
    {
      DepotConfigStore.LoadFromFile(Path.Combine(Path.GetTempPath(), $"steamkit-{Guid.NewGuid()}.config"));

      Exec.PrepareDownload();

      Assert.Null(DepotConfigStore.Instance);
    }

    // Each is set per run or download, or is shared by every run; a new one must be too.
    private static readonly string[] sKnownMutableStatics =
    [
      // Started by each run.
      "AccountSettingsStore.Instance",
      // Whether the console shows progress; never enabled.
      "Ansi.useProgress",
      // Set by each download and sign-in.
      "ContentDownloader.cdnPool",
      "ContentDownloader.Config",
      "ContentDownloader.steam3",
      "DepotConfigStore.Instance",
      // Set by BeginRun, cleared by EndRun.
      "Exec.<Authenticator>k__BackingField",
      "Exec.<Cancellation>k__BackingField",
      "Exec.<Host>k__BackingField",
      "Exec.<Progress>k__BackingField",
      // Set by each sign-in, cleared by EndRun.
      "Exec.<SignedInAnonymously>k__BackingField",
      "Exec.<Verification>k__BackingField",
    ];

    [Fact]
    public void ResetsOrSharesOnPurposeEveryMutableStaticOfTheDownloader()
    {
      var mutableStatics = typeof(Exec).Assembly.GetTypes()
        .Where(type => !type.IsGenericTypeDefinition && !IsCompilerGenerated(type))
        .SelectMany(type => type.GetFields(BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)
          .Where(field => !field.IsInitOnly && !field.IsLiteral && !IsCompilerGenerated(field.DeclaringType!))
          .Select(field => $"{type.Name}.{field.Name}"))
        .Order()
        .ToArray();

      Assert.True(mutableStatics.SequenceEqual(sKnownMutableStatics),
        "The downloader's mutable statics are now:\n" + string.Join('\n', mutableStatics));
    }

    private static bool IsCompilerGenerated(Type type) =>
      type.GetCustomAttribute<System.Runtime.CompilerServices.CompilerGeneratedAttribute>() != null
      || (type.DeclaringType != null && IsCompilerGenerated(type.DeclaringType));
  }
}
