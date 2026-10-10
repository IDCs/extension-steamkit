using System.Threading.Channels;

namespace Common
{
  /// <summary>Hands posted items to a callback in order, batched, on a background task; posting never waits.</summary>
  public sealed class BackgroundDelivery<T>
  {
    private readonly Channel<T> mPending =
      Channel.CreateUnbounded<T>(new UnboundedChannelOptions { SingleReader = true });
    private readonly Task mDelivering;

    public BackgroundDelivery(Func<IReadOnlyList<T>, Task> deliver)
    {
      mDelivering = Task.Run(() => DeliverAsync(deliver));
    }

    public void Post(T item) => mPending.Writer.TryWrite(item);

    /// <summary>Delivers what was posted so far, then stops.</summary>
    public Task CompleteAsync()
    {
      mPending.Writer.TryComplete();
      return mDelivering;
    }

    private async Task DeliverAsync(Func<IReadOnlyList<T>, Task> deliver)
    {
      var batch = new List<T>();
      while (await mPending.Reader.WaitToReadAsync())
      {
        batch.Clear();
        while (mPending.Reader.TryRead(out var item))
        {
          batch.Add(item);
        }
        await deliver(batch);
      }
    }
  }
}
