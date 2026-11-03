import type { JSX } from "@solidjs/web";
import { render } from "@solidjs/web";
import { createRoot, createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";
import { ActivityLeaderboard } from "./activity-leaderboard.tsx";
import { ActivityLeaderboardPage } from "./activity-leaderboard-view.tsx";
import { streakBoard, streakDependencies } from "./activity-leaderboard-story-fixtures.ts";
const stops: (() => void)[] = [];
afterEach(() => { stops.splice(0).forEach(stop => stop()); vi.unstubAllGlobals(); });
function mount(component: () => JSX.Element) {
  const host = document.createElement("div"); document.body.appendChild(host);
  createRoot(stop => { render(component, host); stops.push(() => { stop(); host.remove(); }); }); return host;
}
async function loaded(host: HTMLElement) { await vi.waitFor(() => expect(host.textContent).toContain("harbor.singer")); }
test("the fourth entry survives a tie with the third podium entry", async () => {
  const host = mount(() => <ActivityLeaderboard communityId="community" display="page" title="Harbor" dependencies={streakDependencies("ties")} />);
  await loaded(host);
  const list = host.querySelector('[aria-label="More streaks"]')!;
  expect(list.textContent).toContain("saltline");
  expect(list.querySelector('[aria-label="Rank 3"]')).not.toBeNull();
  expect(host.querySelectorAll('[aria-label="Rank 3"]')).toHaveLength(2);
  expect(host.querySelectorAll('[data-streak-entry="profile-3"]')).toHaveLength(1);
});
test("preview links to the full page without mounting profile or qualification controls", async () => {
  const dependencies = streakDependencies(); const policies = vi.spyOn(dependencies.client!, "get_rewardsQualificationPolicies");
  const host = mount(() => <ActivityLeaderboard communityId="community" display="preview" href="/c/harbor/leaderboard" dependencies={dependencies} />);
  await loaded(host); expect(host.textContent).toContain("Your rank: 18");
  expect(host.querySelector("a")?.getAttribute("href")).toBe("/c/harbor/leaderboard");
  expect(host.querySelector('[aria-label="Presenting profile"]')).toBeNull(); expect(policies).not.toHaveBeenCalled();
});
test("visitor ignores viewer data and never reads private progress", async () => {
  const dependencies = streakDependencies("visitor");
  const progress = vi.spyOn(dependencies.privateClient!, "get_communitiesCommunityIdRewardsProgress");
  const host = mount(() => <ActivityLeaderboard communityId="community" display="page" dependencies={dependencies} />);
  await loaded(host); expect(progress).not.toHaveBeenCalled(); expect(host.querySelector("[data-streak-rail]")).toBeNull(); expect(host.querySelector("[data-pinned-viewer]")).toBeNull();
});
test("private progress failure leaves the successful public board and retry reachable", async () => {
  const host = mount(() => <ActivityLeaderboard communityId="community" display="page" dependencies={streakDependencies("private-error")} />);
  await loaded(host); expect(host.textContent).toContain("Your progress is unavailable."); expect(host.textContent).toContain("Retry progress"); expect(host.querySelector("[data-streak-rail]")).toBeNull();
});
test("a real viewer row controls the pinned copy and signing out clears it", async () => {
  let notify: IntersectionObserverCallback = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal("IntersectionObserver", class { constructor(callback: IntersectionObserverCallback) { notify = callback; } observe() {} disconnect = disconnect; });
  const [authenticated, setAuthenticated] = createSignal(true);
  const host = mount(() => <ActivityLeaderboardPage state="ready" board={streakBoard} authenticated={authenticated()} onRetry={() => {}} title="Harbor" backHref="/c/community" />);
  await loaded(host);
  expect(host.querySelector("[data-pinned-viewer]")).toBeNull();
  // SAFETY: the observer handler reads only isIntersecting; the mock supplies that exact field.
  notify([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
  await vi.waitFor(() => expect(host.querySelector("[data-pinned-viewer]")).not.toBeNull());
  // SAFETY: the observer handler reads only isIntersecting; the mock supplies that exact field.
  notify([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
  await vi.waitFor(() => expect(host.querySelector("[data-pinned-viewer]")).toBeNull());
  setAuthenticated(false); await Promise.resolve(); expect(host.querySelector("[data-pinned-viewer]")).toBeNull();
});
