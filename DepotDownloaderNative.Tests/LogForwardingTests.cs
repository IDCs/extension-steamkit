using System.Collections.Concurrent;

namespace DepotDownloaderNative.Tests
{
  public sealed class LogForwardingTests : IDisposable
  {
    private readonly TextWriter mOriginalOut = Console.Out;
    private readonly TextWriter mOriginalError = Console.Error;
    private readonly ConcurrentQueue<(string Level, string Message)> mLogged = new();

    public LogForwardingTests()
    {
      NativeApi.SetLogger((level, message) => mLogged.Enqueue((level, message)));
    }

    public void Dispose()
    {
      Console.SetOut(mOriginalOut);
      Console.SetError(mOriginalError);
    }

    [Fact]
    public async Task JoinsPartialWritesIntoOneLine()
    {
      Console.Write("Connecting to Steam3...");
      Console.WriteLine(" Done!");

      var logged = await NextMessage();
      Assert.Equal(("debug", "Connecting to Steam3... Done!"), logged);
    }

    /// <summary>Waits for the next message the logger delivers from its background task.</summary>
    private async Task<(string Level, string Message)> NextMessage()
    {
      var deadline = DateTime.UtcNow.AddSeconds(5);
      while (DateTime.UtcNow < deadline)
      {
        if (mLogged.TryDequeue(out var message))
        {
          return message;
        }
        await Task.Delay(10);
      }
      throw new TimeoutException("nothing was logged");
    }
  }
}
