// This file is subject to the terms and conditions defined
// in file 'LICENSE', which is part of this source code package.

using System;
using System.Threading.Tasks;

namespace DepotDownloader
{
    /// <summary>A request others wait on while it is in flight.</summary>
    static class PendingRequest
    {
        /// <summary>
        /// Completes the waiters whatever the request ends with: Steam's answer, refusals included, or, when the
        /// request fails, a cancellation once the request is forgotten so it can be made again.
        /// </summary>
        public static async Task SettleAsync<T>(TaskCompletionSource<T> waiters, Func<Task<T>> request, Action forget)
        {
            try
            {
                waiters.TrySetResult(await request());
            }
            catch (Exception)
            {
                forget();
                waiters.TrySetCanceled();
            }
        }
    }
}
