import {
  ApiTransportError,
  badRequest,
  errorResponse,
  upstreamTimedOut,
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

function contentLength(request: Request): number | undefined {
  const value = request.headers.get("content-length");
  if (value === null) return undefined;
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) throw badRequest("Invalid request body");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > MAX_REQUEST_BODY_BYTES) {
    throw badRequest("Request body is too large");
  }
  return parsed;
}

function boundedBody(body: ReadableStream<Uint8Array>, signal: AbortSignal): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let size = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (signal.aborted) {
        await reader.cancel(signal.reason);
        controller.error(signal.reason);
        return;
      }
      try {
        const next = await reader.read();
        if (next.done) {
          controller.close();
          return;
        }
        size += next.value.byteLength;
        if (size > MAX_REQUEST_BODY_BYTES) {
          await reader.cancel();
          controller.error(badRequest("Request body is too large"));
          return;
        }
        controller.enqueue(next.value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
}

function bodyFor(request: Request, signal: AbortSignal): BodyInit | undefined {
  if (request.body === null || request.method === "GET" || request.method === "HEAD") return undefined;
  return boundedBody(request.body, signal);
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

function localFailureResponse(error: unknown, didTimeout: boolean): Response {
  if (error instanceof ApiTransportError) return errorResponse(error);
  return errorResponse(didTimeout ? upstreamTimedOut() : upstreamUnavailable());
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
    contentLength(request);
    if (!cookieHeaderWithinLimits(request.headers.get("cookie"))) {
      throw badRequest("Cookie header is too large");
    }

    timeout = timeoutSignal(request, options.timeoutMs ?? API_PROXY_TIMEOUT_MS);
    const headers = safeRequestHeaders(request);
    const body = bodyFor(request, timeout.signal);
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
    return localFailureResponse(error, timeout?.didTimeout() === true);
  }
}

export function apiErrorForTests(error: unknown): Response {
  return localFailureResponse(error, false);
}
