import { getRequestEvent } from "@solidjs/web";
import type { JSX } from "solid-js";
import { RenderErrorBoundary } from "../../lib/render-boundary";
import { assertApiResponse, isApiRequestError, type ApiRequestError } from "../../lib/api/client";

function ThrowApiError(props: { error: ApiRequestError }): JSX.Element {
  throw props.error;
}

export default function ApiDataSeamRoute() {
  const event = getRequestEvent();
  const url = new URL(event?.request.url ?? "http://localhost/seam/api");
  const mode = url.searchParams.get("status");

  if (url.searchParams.get("feed") === "1") {
    const result = event?.locals?.apiFeedResult;
    return (
      <main data-route-path="/seam/api" data-api-feed={result?.ok ? "success" : "error"}>
        <h1>API feed seam</h1>
        <p>Public feed items observed by the Worker: {result?.itemCount ?? 0}</p>
      </main>
    );
  }

  if (mode !== "404" && mode !== "500") {
    return (
      <main data-route-path="/seam/api" data-api-seam="ready">
        <h1>API data seam</h1>
        <p>SSR API fetching is exercised by the home route.</p>
      </main>
    );
  }

  const response = new Response(null, { status: Number(mode) });
  try {
    assertApiResponse(response, "/seam/api/probe");
  } catch (error) {
    if (!isApiRequestError(error)) throw error;
    event && (event.locals.routeStatus = error.status);
    if (error.status === 404) {
      return (
        <main data-route-path="/seam/api" data-api-error="404" data-route-status="404">
          <h1>API resource not found</h1>
          <p>The API 404 mapped to the route status.</p>
        </main>
      );
    }
    return (
      <RenderErrorBoundary
        fallback={
          <main data-route-path="/seam/api" data-api-error="boundary">
            <h1>API temporarily unavailable</h1>
            <p>The API 5xx was contained by the route error boundary.</p>
          </main>
        }
      >
        <ThrowApiError error={error} />
      </RenderErrorBoundary>
    );
  }

  return null;
}
