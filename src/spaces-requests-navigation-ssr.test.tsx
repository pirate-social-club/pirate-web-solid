import { createRequestEvent, createSSRResponse, renderToString } from "@solidjs/web";
import { provideRequestEvent } from "@solidjs/web/storage";
import { afterEach, expect, test, vi } from "vitest";
import { env } from "cloudflare:workers";
import { render } from "./entry-server.tsx";
import { ApplicationSessionProvider } from "./features/shell/application-session.tsx";
import { currentSpacesRequestsNavigationEnabled, SpacesRequestsNavigation } from "./features/shell/spaces-requests-navigation.tsx";
import { applicationRequest } from "./worker.ts";

afterEach(() => {
  Object.assign(env, { SPACES_NAME_REQUESTS_ENABLED: undefined });
});

test("SSR reads the deployed binding when the Worker render context omits the presentation flag", async () => {
  env.SPACES_NAME_REQUESTS_ENABLED = "true";
  // SAFETY: this fixture exercises only the typed render-context bindings.
  const response = await applicationRequest(new Request("https://web-next-staging.pirate.sc/settings"), {
    API_NEXT_ORIGIN: "https://api-next-staging.pirate.sc",
    PUBLIC_APP_CANONICAL_ORIGIN: "https://web-next-staging.pirate.sc",
  } as never);
  expect(await response.text()).toContain('data-spaces-name-requests="enabled"');
});

test.each([undefined, "false", "TRUE", "true"])("SSR carries the strict presentation flag %s into both the component and hydration document", async configured => {
  // SAFETY: the fixture deliberately includes invalid configuration values to prove strict gating.
  Object.assign(env, { SPACES_NAME_REQUESTS_ENABLED: configured });
  const request = new Request("https://web-next-staging.pirate.sc/settings");
  const event = createRequestEvent(request);
  const response = await provideRequestEvent(event, async () => {
    const stream = await render(request, undefined, {
      Application: () => <main data-navigation-enabled={String(currentSpacesRequestsNavigationEnabled())} />,
    });
    if (stream instanceof Response) return stream;
    return createSSRResponse(stream, event);
  });
  const html = await response.text();
  expect(html).toContain(`data-spaces-name-requests="${configured === "true" ? "enabled" : "disabled"}"`);
  expect(html).toContain(`data-navigation-enabled="${configured === "true" ? "true" : "false"}"`);
});

test("SSR never reads private history or browser storage for an authenticated shell", () => {
  const get = vi.fn(async () => { throw new Error("private read on SSR"); });
  const html = renderToString(() => <ApplicationSessionProvider state={() => ({ status: "authenticated", userId: "private-account" })}>
    <SpacesRequestsNavigation navigate={() => {}} enabled={false} client={{ get_usersMeSpacesHandleRequests: get }} />
  </ApplicationSessionProvider>);
  expect(html).not.toContain("Spaces name requests");
  expect(html).not.toContain("private-account");
  expect(get).not.toHaveBeenCalled();
});
