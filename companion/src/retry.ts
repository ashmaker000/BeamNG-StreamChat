export async function retryForever(
  task: () => Promise<void>,
  signal: AbortSignal,
  onError: (error: unknown, delayMs: number) => void
): Promise<void> {
  let attempt = 0;
  while (!signal.aborted) {
    try {
      await task();
      attempt = 0;
    } catch (error) {
      if (signal.aborted) return;
      const base = Math.min(60_000, 1_000 * 2 ** Math.min(attempt++, 6));
      const delayMs = Math.round(base * (0.8 + Math.random() * 0.4));
      onError(error, delayMs);
      await wait(delayMs, signal);
    }
  }
}

export function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

