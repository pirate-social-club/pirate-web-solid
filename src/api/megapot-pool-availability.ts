import { ApiClientError } from "@pirate/api-client";

export class MegapotPoolUnavailableError extends Error {
  constructor() { super("megapot_pool_temporarily_unavailable"); }
}

/** A waiting card can leave without cancelling another card's probe. */
function abortable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => { signal.removeEventListener("abort", cancel); reject(signal.reason); };
    signal.addEventListener("abort", cancel, { once: true });
    pending.then(value => {
      signal.removeEventListener("abort", cancel);
      resolve(value);
    }, error => {
      signal.removeEventListener("abort", cancel);
      reject(error);
    });
    if (signal.aborted) cancel();
  });
}

/** Only initial/recovery probes are coordinated. Retain no response data. */
function createPoolReadGate() {
  let available = false;
  let retryAt = 0;
  let generation = 0;
  let probe: Promise<void> | undefined;
  async function execute<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
    const started = generation;
    try {
      const result = await abortable(operation(), signal);
      // Older in-flight reads cannot reopen a newer outage's cooldown.
      if (started === generation) available = true;
      return result;
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 502 && error.code === "provider_unavailable") {
        if (started === generation) {
          ++generation;
          available = false;
          retryAt = Date.now() + 30_000;
        }
        throw new MegapotPoolUnavailableError();
      }
      throw error;
    }
  }
  return {
    async read<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
      for (;;) {
        signal.throwIfAborted();
        if (Date.now() < retryAt) throw new MegapotPoolUnavailableError();
        if (available) return execute(operation, signal);
        if (probe) {
          await abortable(probe, signal);
          continue;
        }
        const result = execute(operation, signal);
        probe = result.then(() => {}, () => {}).then(() => { probe = undefined; });
        return result;
      }
    },
  };
}

const browserGates = new WeakMap<Window, ReturnType<typeof createPoolReadGate>>();

/** Browser-document lifetime, including SPA navigation. SSR callers never share
 * an outage between requests. A page reload creates a fresh gate. */
export function pagePoolReadGate() {
  if (typeof window === "undefined") return createPoolReadGate();
  let gate = browserGates.get(window);
  if (!gate) {
    gate = createPoolReadGate();
    browserGates.set(window, gate);
  }
  return gate;
}
