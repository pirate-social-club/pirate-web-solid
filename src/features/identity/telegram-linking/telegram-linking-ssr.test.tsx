import { createRequestEvent, createSSRResponse, getRequestEvent, renderToString } from "@solidjs/web";
import { expect, test } from "vitest";
import { TelegramLinkingPage } from "./telegram-linking-page";
import { TelegramConnectionsPage } from "./telegram-connections-page";
import { provideRequestEvent } from "@solidjs/web/storage";
import { createRouter, useLocation } from "@solidjs/router";
import { render } from "../../../entry-server.tsx";
import middleware from "../../../middleware.ts";

test("all Telegram pages render public pending markup without browser I/O or identity data", () => {
  for (const render of [() => <TelegramLinkingPage mode="start" />, () => <TelegramLinkingPage mode="callback" />, () => <TelegramConnectionsPage />]) {
    const html = renderToString(render);
    expect(html).toContain("Please wait"); expect(html).toContain("data-route-path");
    expect(html).not.toContain("transaction_id"); expect(html).not.toContain("confirmation_display");
  }
});

// Exercise the actual server entry, request event, router and middleware rather
// than the API suite's request-echo fixture.
const privatePaths = ["/telegram/link", "/telegram/link/callback", "/telegram/link/account"];
const RequestRouter = createRouter({ routes: [...privatePaths, "/search"].map(path => ({ path })) });
function RequestProbe() {
  const location = useLocation();
  return <main data-request-url={getRequestEvent()?.request.url} data-router-search={location.search}>{location.pathname}</main>;
}
function RequestApplication() { return <RequestRouter>{() => <RequestProbe />}</RequestRouter>; }

async function renderRequest(url: string) {
  const request = new Request(url, { headers: { Cookie: "session=fixture-session" } });
  const event = createRequestEvent(request);
  const response = await provideRequestEvent(event, () => middleware[0](request, async () => {
    const stream = await render(request, undefined, { Application: RequestApplication });
    return stream instanceof Response ? stream : createSSRResponse(stream, event);
  }));
  return { event, response, body: await response.text() };
}

function expectPrivateHeaders(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
}

test.each(privatePaths)("server entry scrubs callback values from request event, router and HTML on %s", async path => {
  const { event, response, body } = await renderRequest(`https://pirate.test${path}?code=private-code&state=private-state&navigation_reference=private-reference#private-fragment`);
  expect(response.status).toBe(200);
  expect(event.request.url).toBe(`https://pirate.test${path}`);
  expect(event.request.headers.get("cookie")).toBe("session=fixture-session");
  expect(body).toContain('data-router-search=""');
  for (const value of ["private-code", "private-state", "private-reference", "private-fragment"]) expect(body).not.toContain(value);
  expectPrivateHeaders(response);
  expect(response.headers.get("content-security-policy")).toContain("script-src 'nonce-");
});

test("unrelated server routes retain their query and ordinary response policy", async () => {
  const { event, response, body } = await renderRequest("https://pirate.test/search?q=song");
  expect(event.request.url).toBe("https://pirate.test/search?q=song");
  expect(body).toContain('data-router-search="?q=song"');
  expect(response.headers.get("x-robots-tag")).toBeNull();
});

test.each([200, 302, 500])("middleware preserves private headers and response status %s", async status => {
  const request = new Request("https://pirate.test/telegram/link/callback?code=private-code&state=private-state");
  const event = createRequestEvent(request);
  const response = await provideRequestEvent(event, () => middleware[0](request, async () => new Response(null, {
    status, headers: { "cache-control": "public, max-age=3600", Location: "/telegram/link" },
  })));
  expect(response.status).toBe(status);
  expect(response.headers.get("location")).toBe("/telegram/link");
  expectPrivateHeaders(response);
});

test("private rendering failures produce a fixed error with private headers", async () => {
  const request = new Request("https://pirate.test/telegram/link/callback?code=private-code");
  const response = await provideRequestEvent(createRequestEvent(request), () => middleware[0](request, async () => {
    throw new Error("private-code private-state");
  }));
  expect(response.status).toBe(500);
  expect(await response.text()).toBe("Unable to load Telegram linking.");
  expectPrivateHeaders(response);
});

test("unrelated middleware errors still propagate", async () => {
  const request = new Request("https://pirate.test/search");
  await expect(provideRequestEvent(createRequestEvent(request), () => middleware[0](request, async () => {
    throw new Error("ordinary-error");
  }))).rejects.toThrow("ordinary-error");
});

test("private response headers are also applied without a request event", async () => {
  const response = await middleware[0](new Request("https://pirate.test/telegram/link"), async () => new Response("fixture"));
  expectPrivateHeaders(response);
});
