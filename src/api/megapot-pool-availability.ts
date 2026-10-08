import { ApiClientError } from "@pirate/api-client";

export class MegapotPoolUnavailableError extends Error {
  constructor() { super("megapot_pool_unavailable_for_page"); }
}

/** Serialize public projections so a disabled provider receives only one probe,
 * even when several cards enter the viewport together. Retain no response data. */
function createPoolReadGate() {
  let unavailable = false;
  let tail = Promise.resolve();
  return {
    read<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
      const result = tail.then(async () => {
        signal.throwIfAborted();
        if (unavailable) throw new MegapotPoolUnavailableError();
        try {
          return await operation();
        } catch (error) {
          if (error instanceof ApiClientError && error.status === 502 && error.code === "provider_unavailable") {
            unavailable = true;
            throw new MegapotPoolUnavailableError();
          }
          throw error;
        }
      });
      tail = result.then(() => {}, () => {});
      return result;
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
