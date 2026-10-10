// This file is subject to the terms and conditions defined
// in file 'LICENSE', which is part of this source code package.

using System;
using System.Threading;
using System.Threading.Tasks;
using Common;
using QRCoder;
using SteamKit2.Authentication;

namespace DepotDownloader
{
    /// <summary>The user cancelled the sign-in.</summary>
    public class SignInCancelledException() : Exception("The sign-in was cancelled");

    /// <summary>Answers Steam's sign-in challenges through the host's dialogs.</summary>
    class HostAuthenticator(HostCallbacks host, CancellationToken cancellation = default) : IAuthenticator
    {
        /// <summary>Whether the user cancelled one of Steam's sign-in challenges.</summary>
        public bool SignInCancelled { get; private set; }

        /// <inheritdoc />
        public async Task<string> GetDeviceCodeAsync(bool previousCodeWasIncorrect)
        {
            if (previousCodeWasIncorrect)
            {
                Console.WriteLine("The previous two-factor code was incorrect.");
            }

            return RequireCode(await host.Request2FA(cancellation));
        }

        /// <inheritdoc />
        public async Task<string> GetEmailCodeAsync(string email, bool previousCodeWasIncorrect)
        {
            if (previousCodeWasIncorrect)
            {
                Console.WriteLine("The previous Steam Guard code was incorrect.");
            }

            return RequireCode(await host.RequestSteamGuard(cancellation));
        }

        string RequireCode(string code)
        {
            if (string.IsNullOrEmpty(code))
            {
                throw CancelSignIn();
            }

            return code;
        }

        SignInCancelledException CancelSignIn()
        {
            SignInCancelled = true;
            return new SignInCancelledException();
        }

        // Completes when the user cancels the current sign-in, including a QR code shown before polling.
        TaskCompletionSource signInCancelled = NewSignInCancelled();
        bool promptShown;

        /// <inheritdoc />
        public Task<bool> AcceptDeviceConfirmationAsync()
        {
            Console.WriteLine("Waiting for the sign-in to be approved in the Steam Mobile app.");
            ShowPrompt(null);
            return Task.FromResult(true);
        }

        /// <summary>Asks the user to scan a QR code with the Steam Mobile app, replacing any shown one.</summary>
        public void ShowQrCode(string challengeUrl)
        {
            Console.WriteLine("Waiting for the sign-in QR code to be scanned in the Steam Mobile app.");
            ShowPrompt("data:image/png;base64," + Convert.ToBase64String(
                PngByteQRCodeHelper.GetQRCode(challengeUrl, QRCodeGenerator.ECCLevel.L, QrCodePixelsPerModule)));
        }

        const int QrCodePixelsPerModule = 6;

        static TaskCompletionSource NewSignInCancelled()
        {
            return new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        }

        void ShowPrompt(string qrCode)
        {
            promptShown = true;
            var cancelled = signInCancelled;
            host.ConfirmSignIn(qrCode).ContinueWith(prompt =>
            {
                if (prompt.IsCompletedSuccessfully && prompt.Result)
                {
                    cancelled.TrySetResult();
                }
            }, TaskScheduler.Default);
        }

        /// <summary>Waits for Steam to accept the sign-in, answering its challenges on the way.</summary>
        public Task<AuthPollResult> PollAsync(AuthSession session)
        {
            return PollAsync(session.PollingWaitForResultAsync);
        }

        /// <summary>Whether a sign-in poll is running; it finishes the logon when Steam reconnects meanwhile.</summary>
        public bool Polling { get; private set; }

        /// <summary>
        /// Runs a sign-in poll, stopping it if the user cancels the Steam Mobile approval prompt or the run,
        /// and dismisses that prompt once the poll ends.
        /// </summary>
        internal async Task<T> PollAsync<T>(Func<CancellationToken, Task<T>> poll)
        {
            using var stopPolling = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
            Polling = true;
            try
            {
                var polling = poll(stopPolling.Token);
                if (await Task.WhenAny(polling, signInCancelled.Task) != polling)
                {
                    stopPolling.Cancel();
                    throw CancelSignIn();
                }

                return await polling;
            }
            finally
            {
                Polling = false;
                signInCancelled = NewSignInCancelled();
                if (promptShown)
                {
                    promptShown = false;
                    await host.EndSignInConfirmation();
                }
            }
        }

        /// <summary>Asks the host for a two-factor code on the legacy logon path. Null when the user cancels.</summary>
        public string ReadTwoFactorCode()
        {
            return ReadCode(GetDeviceCodeAsync(false));
        }

        /// <summary>Asks the host for an emailed Steam Guard code on the legacy logon path. Null if cancelled.</summary>
        public string ReadEmailCode()
        {
            return ReadCode(GetEmailCodeAsync(null, false));
        }

        // The legacy prompts run inside a synchronous SteamKit callback, off the host's thread.
        static string ReadCode(Task<string> prompt)
        {
            try
            {
                return prompt.GetAwaiter().GetResult();
            }
            catch (Exception ex)
            {
                Console.WriteLine("Steam Guard prompt ended without a code: {0}", ex.Message);
                return null;
            }
        }
    }
}
