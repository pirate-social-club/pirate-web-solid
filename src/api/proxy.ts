import {
  ApiTransportError,
  badRequest,
  errorResponse,
  upstreamUnavailable,
} from "./errors.ts";
import {
  MAX_REQUEST_BODY_BYTES,
  cookieHeaderWithinLimits,
  safeRequestHeaders,
  safeResponseHeaders,
} from "./headers.ts";
import { apiNextOriginOrError, upstreamUrl } from "./origin.ts";

export const API_PROXY_TIMEOUT_MS = 15_000;

export type ApiFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface ApiProxyEnvironment {
  readonly API_NEXT_ORIGIN?: string;
}

export interface ApiProxyOptions {
  readonly fetchImpl?: ApiFetch;
  /** Test-only override; production always uses the 15 second default. */
  readonly timeoutMs?: number;
}

function validateContentLength(request: Request): void {
  const value = request.headers.get("content-length");
  if (value === null) return;
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) throw badRequest("Invalid request body");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > MAX_REQUEST_BODY_BYTES) {
    throw badRequest("Request body is too large");
  }
}

/**
 * Read at most the deliberately small request cap before starting the
 * upstream fetch. A streaming request body otherwise lets fetch return an
 * early response before its body has discovered an oversized or failed
 * chunk, which could incorrectly turn the request into a successful proxy
 * response. The bounded buffer is at most 1 MiB and is then sent as the
 * upstream request body.
 */
async function readBoundedBody(body: ReadableStream<Uint8Array>, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const reader = body.getReader();
  const buffer = new Uint8Array(new ArrayBuffer(MAX_REQUEST_BODY_BYTES));
  let size = 0;
  let rejectAbort: ((reason?: unknown) => void) | undefined;
  const abortPromise = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  // The synchronous already-aborted path can reject before the read race is
  // installed; keep that intentional rejection from becoming unhandled.
  void abortPromise.catch(() => undefined);
  const onAbort = (): void => {
    const reason = signal.reason ?? new DOMException("The operation was aborted", "AbortError");
    rejectAbort?.(reason);
    // Reject the read race before cancelling the reader, since cancel() may
    // resolve a pending read as { done: true }.
    void reader.cancel(reason).catch(() => undefined);
  };
  if (signal.aborted) onAbort();
  else signal.addEventListener("abort", onAbort, { once: true });

  try {
    while (true) {
      if (signal.aborted) throw signal.reason ?? new DOMException("The operation was aborted", "AbortError");
      const next = await Promise.race([reader.read(), abortPromise]);
      if (next.done) {
        return buffer.slice(0, size);
      }
      if (next.value.byteLength > MAX_REQUEST_BODY_BYTES - size) {
        await reader.cancel();
        throw badRequest("Request body is too large");
      }
      buffer.set(next.value, size);
      size += next.value.byteLength;
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

async function bodyFor(request: Request, signal: AbortSignal): Promise<BodyInit | undefined> {
  if (request.body === null || request.method === "GET" || request.method === "HEAD") return undefined;
  // Blob is a Fetch-standard BodyInit across Workers and Bun; it keeps the
  // preflighted payload bounded without relying on Node-only Buffer types.
  return new Blob([await readBoundedBody(request.body, signal)]);
}

interface TimeoutSignal {
  readonly signal: AbortSignal;
  readonly didTimeout: () => boolean;
  readonly finish: () => void;
  readonly interrupt: Promise<never>;
}

function timeoutSignal(request: Request, timeoutMs: number): TimeoutSignal {
  const controller = new AbortController();
  let timedOut = false;
  let finished = false;
  let interruptRequest: ((reason?: unknown) => void) | undefined;
  const interrupt = new Promise<never>((_resolve, reject) => {
    interruptRequest = reject;
  });
  const onAbort = (): void => {
    if (!finished) {
      const reason = request.signal.reason ?? new DOMException("The operation was aborted", "AbortError");
      controller.abort(reason);
      interruptRequest?.(reason);
    }
  };
  if (request.signal.aborted) onAbort();
  else request.signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => {
    if (!finished) {
      timedOut = true;
      const reason = new DOMException("API request timed out", "TimeoutError");
      controller.abort(reason);
      interruptRequest?.(reason);
    }
  }, timeoutMs);
  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    interrupt,
    finish: () => {
      finished = true;
      clearTimeout(timer);
      request.signal.removeEventListener("abort", onAbort);
    },
  };
}

function localFailureResponse(error: unknown): Response {
  if (error instanceof ApiTransportError) return errorResponse(error);
  return errorResponse(upstreamUnavailable());
}

/**
 * Proxy one same-origin /api request to api-next. This function is deliberately
 * stateless: all origin, credentials, and abort state belongs to this call.
 */
export async function proxyApiRequest(
  request: Request,
  environment: ApiProxyEnvironment,
  options: ApiProxyOptions = {},
): Promise<Response> {
  let timeout: ReturnType<typeof timeoutSignal> | undefined;
  try {
    const origin = apiNextOriginOrError(environment.API_NEXT_ORIGIN);
    const requestUrl = new URL(request.url);
    const target = upstreamUrl(requestUrl, origin);
    validateContentLength(request);
    if (!cookieHeaderWithinLimits(request.headers.get("cookie"))) {
      throw badRequest("Cookie header is too large");
    }

    timeout = timeoutSignal(request, options.timeoutMs ?? API_PROXY_TIMEOUT_MS);
    const headers = safeRequestHeaders(request);
    const body = await bodyFor(request, timeout.signal);
    const upstream = await Promise.race([
      (options.fetchImpl ?? fetch)(target, {
      method: request.method,
      headers,
      ...(body === undefined ? {} : { body }),
      signal: timeout.signal,
      redirect: "manual",
      }),
      timeout.interrupt,
    ]);
    const responseHeaders = safeResponseHeaders(upstream);
    if (upstream.body === null) {
      timeout.finish();
      return new Response(null, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      });
    }
    // Keep the timeout and abort signal alive while a streamed upstream body
    // is consumed. The response remains streaming; no body is buffered.
    const reader = upstream.body.getReader();
    const bodyStream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const next = await reader.read();
          if (next.done) {
            timeout?.finish();
            controller.close();
          } else {
            controller.enqueue(next.value);
          }
        } catch (error) {
          timeout?.finish();
          controller.error(error);
        }
      },
      async cancel(reason) {
        timeout?.finish();
        await reader.cancel(reason);
      },
    });
    return new Response(bodyStream, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    timeout?.finish();
    if (request.signal.aborted && !timeout?.didTimeout()) throw error;
    return localFailureResponse(error);
  }
}

export function apiErrorForTests(error: unknown): Response {
  return localFailureResponse(error);
}
