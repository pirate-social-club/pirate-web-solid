import type { Page, Request, Response } from "playwright/test";

const MAX_EVENTS = 100;

interface NetworkEvent {
  readonly kind: "request-failed" | "response";
  readonly method: string;
  readonly target: string;
  readonly status?: number;
  readonly failure?: string;
}

export interface SanitizedNetworkDiagnostics {
  readonly summary: () => string;
  readonly stop: () => void;
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
  return ["document", "fetch", "xhr"].includes(request.resourceType());
}

export function captureSanitizedNetworkDiagnostics(page: Page): SanitizedNetworkDiagnostics {
  const events: NetworkEvent[] = [];
  const append = (event: NetworkEvent) => {
    if (events.length < MAX_EVENTS) events.push(event);
  };
  const onResponse = (response: Response) => {
    const request = response.request();
    if (!isDiagnosticRequest(request)) return;
    append({
      kind: "response",
      method: request.method(),
      status: response.status(),
      target: targetOf(response.url()),
    });
  };
  const onRequestFailed = (request: Request) => {
    if (!isDiagnosticRequest(request)) return;
    append({
      failure: failureOf(request),
      kind: "request-failed",
      method: request.method(),
      target: targetOf(request.url()),
    });
  };

  page.on("response", onResponse);
  page.on("requestfailed", onRequestFailed);
  return {
    stop: () => {
      page.off("response", onResponse);
      page.off("requestfailed", onRequestFailed);
    },
    summary: () => JSON.stringify(events, null, 2),
  };
}
