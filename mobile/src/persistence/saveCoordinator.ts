export const SAVE_WAIT_TIMEOUT_MS = 10_000;

export class SavePendingError extends Error {
  constructor(
    message = 'Saving is taking longer than expected. Check your connection and try again. Your change is still waiting to save.',
  ) {
    super(message);
    this.name = 'SavePendingError';
  }
}

export function saveErrorMessage(error: unknown, fallback: string): string {
  return error instanceof SavePendingError ? error.message : fallback;
}

function waitForSave(completion: Promise<void>, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new SavePendingError()), timeoutMs);
    completion.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// A UI timeout does not cancel a queued Firestore write. Keep its real completion
// so retries wait on that write and different changes cannot race it. The operation
// updates session state on acknowledgement, even after a caller stops waiting.
export class SaveCoordinator {
  private pending: { key: string; completion: Promise<void> } | null = null;
  private readonly timeoutMs: number;

  constructor(timeoutMs = SAVE_WAIT_TIMEOUT_MS) {
    this.timeoutMs = timeoutMs;
  }

  run(key: string, operation: () => Promise<void>): Promise<void> {
    if (this.pending && this.pending.key !== key) {
      return Promise.reject(
        new SavePendingError(
          'Your previous change is still waiting to save. Check your connection and retry it before making another change.',
        ),
      );
    }

    if (!this.pending) {
      const pending = { key, completion: Promise.resolve().then(operation) };
      this.pending = pending;
      const clear = () => {
        if (this.pending === pending) {
          this.pending = null;
        }
      };
      // Handle both outcomes even when all UI callers have already timed out.
      void pending.completion.then(clear, clear);
    }

    return waitForSave(this.pending.completion, this.timeoutMs);
  }
}
