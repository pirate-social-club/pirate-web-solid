import { renderToString } from "@solidjs/web";
import { expect, test, vi } from "vitest";
import HomeRoute from "./index.tsx";
import { ApplicationSessionProvider } from "../features/shell/application-session.tsx";

const emptyFeed = { items: [], topCommunities: [], nextCursor: null };
test("Home SSR stays public-first and cannot consume video outcome permission", () => {
  const claim = vi.fn(); const resolve = vi.fn();
  const html = renderToString(() => <HomeRoute claimVideoOutcome={claim} resolveSession={resolve} publicData={emptyFeed} homeData={emptyFeed} />);
  expect(html).toContain('data-home-session="resolving"');
  expect(html).not.toContain("data-video-outcome-toast");
  expect(claim).not.toHaveBeenCalled(); expect(resolve).not.toHaveBeenCalled();
});
test("even an injected authenticated SSR session cannot claim", () => {
  const claim = vi.fn();
  renderToString(() => <ApplicationSessionProvider state={() => ({ status: "authenticated", userId: "author" })}><HomeRoute claimVideoOutcome={claim} publicData={emptyFeed} homeData={emptyFeed} /></ApplicationSessionProvider>);
  expect(claim).not.toHaveBeenCalled();
});
