/* Copyright (C) 2026-present Aristotelis — see repository license. */

const SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT'] as const;

/** Something the shutdown closes, in order: the HTTP server, then the application. */
export interface Closable {
  close(): Promise<unknown>;
}

/**
 * On `SIGTERM` or `SIGINT`, closes each of `targets` in turn, logs a failure and goes on,
 * then re-raises the signal so the process ends with it.
 *
 * @example
 * ```ts
 * closeOnShutdownSignals([server, app]);
 * ```
 */
export function closeOnShutdownSignals(targets: readonly Closable[]): void {
  const handlers = new Map<NodeJS.Signals, () => void>();
  const release = () => {
    for (const [signal, handler] of handlers) {
      process.removeListener(signal, handler);
    }
  };
  for (const signal of SHUTDOWN_SIGNALS) {
    const handler = () => {
      release();
      void (async () => {
        for (const target of targets) {
          await target.close().catch((error: unknown) => {
            console.error('Shutdown step failed', error);
          });
        }
      })().finally(() => process.kill(process.pid, signal));
    };
    handlers.set(signal, handler);
    process.on(signal, handler);
  }
}
