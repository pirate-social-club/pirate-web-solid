import { renderToString } from "@solidjs/web";
import { expect, test, vi } from "vitest";
import HomeRoute from "./index.tsx";
import { ApplicationSessionProvider } from "../features/shell/application-session.tsx";
import { RewardServiceAvailabilityProvider, useRewardServiceAvailability } from "../features/rewards/reward-service-availability.tsx";

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

test("authenticated SSR never reads rewards or exposes Boost availability", () => {
  const read = vi.fn(async (): Promise<never> => { throw new Error("SSR must not read private reward policies"); });
  const Probe = () => {
    const available = useRewardServiceAvailability();
    return <span>{available() ? "available" : "hidden"}</span>;
  };
  const html = renderToString(() => <ApplicationSessionProvider state={() => ({ status: "authenticated", userId: "account" })}>
    <RewardServiceAvailabilityProvider client={{ get_rewardsQualificationPolicies: read }}><Probe /></RewardServiceAvailabilityProvider>
  </ApplicationSessionProvider>);
  expect(html).toContain("hidden");
  expect(html).not.toContain("available");
  expect(read).not.toHaveBeenCalled();
});
