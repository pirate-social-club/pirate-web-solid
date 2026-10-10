import { createRequestEvent, createSSRResponse, getRequestEvent, renderToString } from "@solidjs/web";
import { provideRequestEvent } from "@solidjs/web/storage";
import { createRouter, useLocation } from "@solidjs/router";
import { expect, test, vi } from "vitest";
import { TelegramIdentityProbePage } from "./telegram-identity-probe-page.tsx";
import { TELEGRAM_PROBE_PATH, TELEGRAM_PROBE_CALLBACK_PATH, TELEGRAM_PROBE_ORIGIN } from "./telegram-identity-probe-config.ts";
import { render } from "../../../entry-server.tsx";
import middleware from "../../../middleware.ts";

test("both probe pages render without browser or provider I/O", () => {
  for (const callback of [false, true]) {
    const html = renderToString(() => <TelegramIdentityProbePage callback={callback} />);
    expect(html).toContain("Telegram login test");
    expect(html).not.toContain("privy_oauth_code");
    expect(html).not.toContain("provider-access");
  }
});

const Router = createRouter({ routes: [TELEGRAM_PROBE_PATH, TELEGRAM_PROBE_CALLBACK_PATH].map(path => ({ path })) });
function LocationProbe() {
  const location = useLocation();
  return <main data-request-url={getRequestEvent()?.request.url} data-router-search={location.search}>{location.pathname}</main>;
}
function Application() { return <Router>{() => <LocationProbe />}</Router>; }

test.each([TELEGRAM_PROBE_PATH, TELEGRAM_PROBE_CALLBACK_PATH])("actual server entry excludes callback credentials from router and HTML on %s", async path => {
  const request = new Request(`${TELEGRAM_PROBE_ORIGIN}${path}?privy_oauth_code=secret-code&privy_oauth_state=secret-state#secret-fragment`);
  const event = createRequestEvent(request);
  vi.useFakeTimers({ now: Date.parse("2026-10-10T15:30:00Z") });
  let response: Response;
  try { response = await provideRequestEvent(event, () => middleware[0](request, async () => {
    const stream = await render(request, { PUBLIC_APP_CANONICAL_ORIGIN: TELEGRAM_PROBE_ORIGIN }, { Application });
    return stream instanceof Response ? stream : createSSRResponse(stream, event);
  })); } finally { vi.useRealTimers(); }
  const html = await response.text();
  expect(event.request.url).toBe(`${TELEGRAM_PROBE_ORIGIN}${path}`);
  expect(html).toContain('data-router-search=""');
  for (const secret of ["secret-code", "secret-state", "secret-fragment"]) expect(html).not.toContain(secret);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
});

test("actual render refuses production, unconfigured and expired probe pages", async () => {
  for (const [origin, canonicalOrigin, now] of [
    ["https://pirate.sc", "https://pirate.sc", "2026-10-10T15:30:00Z"],
    [TELEGRAM_PROBE_ORIGIN, undefined, "2026-10-10T15:30:00Z"],
    [TELEGRAM_PROBE_ORIGIN, TELEGRAM_PROBE_ORIGIN, "2026-10-17T00:00:00Z"],
  ]) {
    vi.useFakeTimers({ now: Date.parse(now ?? "") });
    try {
      const response = await render(new Request(`${origin}${TELEGRAM_PROBE_PATH}`), { PUBLIC_APP_CANONICAL_ORIGIN: canonicalOrigin }, { Application });
      expect(response).toBeInstanceOf(Response);
      if (!(response instanceof Response)) throw new Error("missing refusal");
      expect(response.status).toBe(404); expect(await response.text()).toBe("");
    } finally { vi.useRealTimers(); }
  }
});
