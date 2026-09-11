import type { Page, Request, Response } from "playwright/test";
import { isCreationCall, sanitizeCreationBody } from "./creation-diagnostics.ts";

const MAX_EVENTS = 100;

interface NetworkEvent {
  readonly kind: "request" | "request-failed" | "response";
  readonly requestId: number;
  readonly method: string;
  readonly target: string;
  readonly status?: number;
  readonly failure?: string;
  readonly resourceType?: string;
  readonly body?: unknown;
}

export interface SanitizedNetworkDiagnostics {
  readonly summary: () => string;
  readonly stop: () => Promise<void>;
}

function targetOf(url: string): string {
  const parsed = new URL(url);
  const pathname = parsed.pathname
    .replace(/\/(personas|users|community-creation-intents)\/[^/]+/gu, "/$1/:id");
  return `${parsed.hostname}${pathname}`.slice(0, 500);
}

function failureOf(request: Request): string {
  const error = request.failure()?.errorText;
  return error && /^net::[A-Z_]+$/u.test(error) ? error : "request failed";
}

function isDiagnosticRequest(request: Request): boolean {
  return isCreationCall(request.url()) || ["document", "fetch", "xhr"].includes(request.resourceType());
}

export function captureSanitizedNetworkDiagnostics(page: Page): SanitizedNetworkDiagnostics {
  const events: NetworkEvent[] = [];
  const context = page.context();
  const pending = new Set<Promise<void>>();
  const ids = new WeakMap<Request, number>();
  let nextId = 1;
  const id = (request: Request) => {
    if (!ids.has(request)) ids.set(request, nextId++);
    return ids.get(request)!;
  };
  const append = (event: NetworkEvent) => {
    if (events.length < MAX_EVENTS) events.push(event);
  };
  const onRequest = (request: Request) => {
    if (!isDiagnosticRequest(request)) return;
    append({ kind: "request", requestId: id(request), method: request.method(),
      target: targetOf(request.url()), resourceType: request.resourceType(),
      ...(isCreationCall(request.url()) ? { body: sanitizeCreationBody(request.postData()) } : {}),
    });
  };
  const captureResponse = async (response: Response) => {
    const request = response.request();
    if (!isDiagnosticRequest(request)) return;
    append({
      kind: "response",
      requestId: id(request),
      method: request.method(),
      status: response.status(),
      target: targetOf(response.url()),
      ...(isCreationCall(response.url()) ? {
        body: await response.text().then(sanitizeCreationBody, () => ({ unavailable: true })),
      } : {}),
    });
  };
  const onResponse = (response: Response) => {
    const work = captureResponse(response);
    pending.add(work);
    void work.finally(() => pending.delete(work));
  };
  const onRequestFailed = (request: Request) => {
    if (!isDiagnosticRequest(request)) return;
    append({
      failure: failureOf(request),
      kind: "request-failed",
      requestId: id(request),
      method: request.method(),
      target: targetOf(request.url()),
    });
  };

  context.on("request", onRequest);
  context.on("response", onResponse);
  context.on("requestfailed", onRequestFailed);
  return {
    stop: async () => {
      context.off("request", onRequest);
      context.off("response", onResponse);
      context.off("requestfailed", onRequestFailed);
      await Promise.allSettled(pending);
    },
    summary: () => JSON.stringify(events, null, 2),
  };
}
