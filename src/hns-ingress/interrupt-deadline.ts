export interface InterruptDeadline {
  readonly signal: AbortSignal;
  readonly interrupt: Promise<never>;
  readonly didTimeout: () => boolean;
  readonly finish: () => void;
}

/** A deadline that still settles when a test double or upstream ignores AbortSignal. */
export function makeInterruptDeadline(parent: AbortSignal | undefined, milliseconds: number): InterruptDeadline {
  const controller = new AbortController();
  let timedOut = false;
  let rejectInterrupt: ((reason?: unknown) => void) | undefined;
  const interrupt = new Promise<never>((_resolve, reject) => { rejectInterrupt = reject; });
  void interrupt.catch(() => undefined);
  const onAbort = (): void => {
    const reason = parent?.reason ?? new DOMException("Aborted", "AbortError");
    controller.abort(reason);
    rejectInterrupt?.(reason);
  };
  if (parent?.aborted) onAbort(); else parent?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    const reason = new DOMException("Request timed out", "TimeoutError");
    controller.abort(reason);
    rejectInterrupt?.(reason);
  }, milliseconds);
  return {
    signal: controller.signal,
    interrupt,
    didTimeout: () => timedOut,
    finish: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onAbort);
    },
  };
}
