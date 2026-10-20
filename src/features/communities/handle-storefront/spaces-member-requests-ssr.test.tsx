import { renderToString } from "@solidjs/web";
import { expect, test, vi } from "vitest";
import { ApplicationSessionProvider } from "../../shell/application-session.tsx";
import { SpacesMemberRequests } from "./spaces-member-requests.tsx";

test("the private account route sends only a loading shell, without private API or browser storage access", () => {
  const get = vi.fn(async () => { throw new Error("SSR must not read private requests"); });
  const html = renderToString(() => <ApplicationSessionProvider state={() => ({ status: "authenticated", userId: "account-ssr-private" })}>
    <SpacesMemberRequests client={{ get_usersMeSpacesHandleRequests: get }} />
  </ApplicationSessionProvider>);
  expect(html).toContain("Spaces name requests");
  expect(html).toContain("Checking your requests");
  expect(html).not.toContain("account-ssr-private");
  expect(html).not.toContain("data-spaces-member-request=");
  expect(html).not.toContain("Retry original request");
  expect(get).not.toHaveBeenCalled();
});
