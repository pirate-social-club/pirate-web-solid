import { createRequestEvent, createSSRResponse, renderToString } from "@solidjs/web";
import { provideRequestEvent } from "@solidjs/web/storage";
import { expect, test, vi } from "vitest";
import { render } from "./entry-server.tsx";
import { ApplicationSessionProvider } from "./features/shell/application-session.tsx";
import { currentSpacesRequestsNavigationEnabled, SpacesRequestsNavigation } from "./features/shell/spaces-requests-navigation.tsx";
import { applicationRequest } from "./worker.ts";

test("the actual Worker forwards the presentation flag to the SSR hydration document", async () => {
  // SAFETY: this fixture exercises only the typed render-context bindings.
  const response = await applicationRequest(new Request("https://web-next-staging.pirate.sc/settings"), {
    API_NEXT_ORIGIN: "https://api-next-staging.pirate.sc",
    PUBLIC_APP_CANONICAL_ORIGIN: "https://web-next-staging.pirate.sc",
    SPACES_NAME_REQUESTS_ENABLED: "true",
  } as never);
  expect(await response.text()).toContain('data-spaces-name-requests="enabled"');
});

test.each([undefined, "false", "TRUE", "true"])("SSR carries the strict presentation flag %s into both the component and hydration document", async configured => {
  const request = new Request("https://web-next-staging.pirate.sc/settings");
  const event = createRequestEvent(request);
  const response = await provideRequestEvent(event, async () => {
    const stream = await render(request, { SPACES_NAME_REQUESTS_ENABLED: configured }, {
      Application: () => <main data-navigation-enabled={String(currentSpacesRequestsNavigationEnabled())} />,
    });
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
