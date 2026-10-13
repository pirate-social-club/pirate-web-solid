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

test("actual render also refuses disabled hydration and an alternate asset origin", async () => {
  vi.useFakeTimers({ now: Date.parse("2026-10-10T15:30:00Z") });
  try {
    for (const context of [
      { PUBLIC_APP_CANONICAL_ORIGIN: TELEGRAM_PROBE_ORIGIN, DISABLE_HYDRATION: true },
      { PUBLIC_APP_CANONICAL_ORIGIN: TELEGRAM_PROBE_ORIGIN, CANONICAL_ASSET_ORIGIN: "https://assets.example.invalid" },
    ]) {
      const response = await render(new Request(`${TELEGRAM_PROBE_ORIGIN}${TELEGRAM_PROBE_CALLBACK_PATH}`), context, { Application });
      if (!(response instanceof Response)) throw new Error("missing refusal");
      expect(response.status).toBe(404); expect(await response.text()).toBe("");
    }
  } finally { vi.useRealTimers(); }
});

// Every other spelling the router routes to a private Telegram page: case, a trailing slash,
// extra slashes and percent-encoding. Each is refused before routing, in every context.
const aliases = [
  "/internal/telegram-login-probe/", "/INTERNAL/TELEGRAM-LOGIN-PROBE", "/Internal/Telegram-Login-Probe/",
  "/internal/telegram-login-probe/callback/", "/INTERNAL/TELEGRAM-LOGIN-PROBE/CALLBACK/",
  "//internal/telegram-login-probe/callback//", "/internal/telegram%2Dlogin-probe/callback",
  "/telegram/link/callback/", "/TELEGRAM/LINK/CALLBACK", "/telegram/l%69nk/callback", "/Telegram/Link/Account/",
];
const contexts = [
  ["allowed staging", TELEGRAM_PROBE_ORIGIN, { PUBLIC_APP_CANONICAL_ORIGIN: TELEGRAM_PROBE_ORIGIN }, "2026-10-10T15:30:00Z"],
  ["production", "https://pirate.sc", { PUBLIC_APP_CANONICAL_ORIGIN: "https://pirate.sc" }, "2026-10-10T15:30:00Z"],
  ["unconfigured", TELEGRAM_PROBE_ORIGIN, {}, "2026-10-10T15:30:00Z"],
  ["expired", TELEGRAM_PROBE_ORIGIN, { PUBLIC_APP_CANONICAL_ORIGIN: TELEGRAM_PROBE_ORIGIN }, "2026-10-17T00:00:00Z"],
  ["disabled hydration", TELEGRAM_PROBE_ORIGIN, { PUBLIC_APP_CANONICAL_ORIGIN: TELEGRAM_PROBE_ORIGIN, DISABLE_HYDRATION: true }, "2026-10-10T15:30:00Z"],
  ["alternate assets", TELEGRAM_PROBE_ORIGIN, { PUBLIC_APP_CANONICAL_ORIGIN: TELEGRAM_PROBE_ORIGIN, CANONICAL_ASSET_ORIGIN: "https://assets.example.invalid" }, "2026-10-10T15:30:00Z"],
] as const;

test.each(contexts)("route aliases are refused privately with callbacks scrubbed: %s", async (_name, origin, context, now) => {
  vi.useFakeTimers({ now: Date.parse(now) });
  try {
    for (const alias of aliases) {
      const request = new Request(`${origin}${alias}?privy_oauth_code=secret-code&privy_oauth_state=secret-state&code=secret-code&state=secret-state#secret-fragment`);
      const event = createRequestEvent(request);
      const response = await provideRequestEvent(event, () => middleware[0](request, async () => {
        const stream = await render(request, context, { Application });
        return stream instanceof Response ? stream : createSSRResponse(stream, event);
      }));
      expect(response.status, alias).toBe(404);
      const body = await response.text();
      expect(body, alias).toBe("");
      for (const secret of ["secret-code", "secret-state", "secret-fragment"]) {
        expect(event.request.url, alias).not.toContain(secret);
        expect(body, alias).not.toContain(secret);
      }
      expect(response.headers.get("cache-control"), alias).toBe("private, no-store");
      expect(response.headers.get("referrer-policy"), alias).toBe("no-referrer");
      expect(response.headers.get("x-robots-tag"), alias).toBe("noindex, nofollow");
    }
  } finally { vi.useRealTimers(); }
});

test("a private Telegram page that fails to render keeps the private headers", async () => {
  const request = new Request(`${TELEGRAM_PROBE_ORIGIN}${TELEGRAM_PROBE_CALLBACK_PATH}?privy_oauth_code=secret-code&privy_oauth_state=secret-state`);
  const event = createRequestEvent(request);
  const response = await provideRequestEvent(event, () => middleware[0](request, async () => {
    throw new Error("render failed with secret-code");
  }));
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain("secret-code");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
});
