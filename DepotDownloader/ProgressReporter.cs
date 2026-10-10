// This file is subject to the terms and conditions defined
// in file 'LICENSE', which is part of this source code package.

using System;
using System.Threading;
using System.Threading.Tasks;
using Common;

namespace DepotDownloader
{
    /// <summary>Passes download progress to the host in whole percents, in order, without blocking.</summary>
    sealed class ProgressReporter
    {
        readonly BackgroundDelivery<int> delivery;
        int lastPercent = -1;

        public ProgressReporter(Func<int, Task> report)
        {
            delivery = new BackgroundDelivery<int>(async percents =>
            {
                foreach (var percent in percents)
                {
                    try
                    {
                        await report(percent);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine("Failed to report download progress: {0}", ex.Message);
                    }
                }
            });
        }

        public void Report(ulong downloaded, ulong total)
        {
            if (total == 0)
            {
                return;
            }

            var percent = (int)(downloaded * 100 / total);
            if (Interlocked.Exchange(ref lastPercent, percent) != percent)
            {
                delivery.Post(percent);
            }
        }

        /// <summary>Delivers the progress reported so far, then stops.</summary>
        public Task CompleteAsync() => delivery.CompleteAsync();
    }
}
