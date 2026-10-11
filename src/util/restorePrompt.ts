/** The files a verification found differing, offered for the user to restore. */
export interface IRestoreRequest {
  files: string[];
  /** Tells apart requests, so the dialog starts each with every file selected. */
  requestId: number;
}

/** Asks which differing files to restore, one request at a time, through steamkit's restore dialog. */
export class RestorePrompt {
  private mShow: (visible: boolean) => void;
  private mPending: (IRestoreRequest & { settle: (selected: string[]) => void }) | undefined;
  private mRequestCount = 0;

  /** @param show Shows the restore dialog, or hides it. */
  constructor(show: (visible: boolean) => void) {
    this.mShow = show;
  }

  /** The request the dialog shows; undefined when none is waiting. */
  public get pending(): IRestoreRequest | undefined {
    return this.mPending;
  }

  /** Resolves to the files the user selects to restore; none when they cancel. */
  public ask(files: string[]): Promise<string[]> {
    this.cancel();
    return new Promise((resolve) => {
      this.mPending = { files, requestId: ++this.mRequestCount, settle: resolve };
      this.mShow(true);
    });
  }

  /** Ends the waiting request with the user's selection. */
  public answer(selected: string[]): void {
    const pending = this.mPending;
    if (pending === undefined) {
      return;
    }
    this.mPending = undefined;
    this.mShow(false);
    pending.settle(selected);
  }

  /** Ends the waiting request, if any, restoring nothing. */
  public cancel(): void {
    this.answer([]);
  }
}
