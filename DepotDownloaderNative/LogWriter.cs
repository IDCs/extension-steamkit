using System.Text;
using Common;

namespace DepotDownloaderNative
{
  /// <summary>Forwards written text to a log callback in batches of complete lines.</summary>
  /// <remarks>
  /// A host call blocks until the host thread runs it, and Console holds its lock while writing, so lines go
  /// out from a background task to avoid deadlocking host-thread code that also writes. Console serializes
  /// writes, so the pending line needs no lock of its own.
  /// </remarks>
  internal sealed class LogWriter : TextWriter
  {
    private readonly BackgroundDelivery<string> mLines;
    private readonly StringBuilder mLine = new();

    public LogWriter(string level, Action<string, string> log)
    {
      mLines = new BackgroundDelivery<string>(lines =>
      {
        log(level, string.Join('\n', lines));
        return Task.CompletedTask;
      });
    }

    public override Encoding Encoding => Encoding.UTF8;

    public override void Write(char value) => Write(new ReadOnlySpan<char>(in value));

    public override void Write(char[] buffer, int index, int count) => Write(buffer.AsSpan(index, count));

    public override void Write(string? value) => Write(value.AsSpan());

    public override void Write(ReadOnlySpan<char> text)
    {
      foreach (var character in text)
      {
        if (character == '\n')
        {
          if (mLine.Length > 0)
          {
            mLines.Post(mLine.ToString());
            mLine.Clear();
          }
        }
        else if (character != '\r')
        {
          mLine.Append(character);
        }
      }
    }

    protected override void Dispose(bool disposing)
    {
      _ = mLines.CompleteAsync();
      base.Dispose(disposing);
    }
  }
}
