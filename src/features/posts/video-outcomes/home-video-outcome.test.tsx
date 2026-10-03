import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot, createSignal, flush } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";
import HomeRoute from "../../../routes/index.tsx";
import { ApplicationSessionProvider, type ApplicationSessionState } from "../../shell/application-session.tsx";
import { refreshSession } from "../../../api/session.ts";
import type { VideoOutcomeClaim } from "./claim.ts";
import { VIDEO_OUTCOME_TOAST_DURATION_MS } from "./home-video-outcome.tsx";
import { UiLocaleProvider } from "../../../lib/ui-locale.tsx";

const disposers: (() => void)[] = [];
const emptyFeed = { items: [], topCommunities: [], nextCursor: null };
const account = (userId = "author"): ApplicationSessionState => ({ status: "authenticated", userId });
const loser: VideoOutcomeClaim = { object: "video_outcome_claim", display_permission: false, outcome: null };
let submission = 0;
function winning(kind: "processing_failure" | "policy_block" = "processing_failure"): VideoOutcomeClaim {
  return { object: "video_outcome_claim", display_permission: true, outcome: { submission_id: `notice-${++submission}`, kind, song: { community_id: "frozen-community", post_id: "frozen-post" } } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function render(ui: () => JSX.Element) {
  const container = document.createElement("div"); document.body.appendChild(container);
  let dispose = () => {};
  createRoot(done => { dispose = done; solidRender(ui, container); });
  const close = () => { dispose(); container.remove(); };
  disposers.push(close);
  return { container, close };
}
function home(claim: () => Promise<VideoOutcomeClaim>, initial: ApplicationSessionState = account()) {
  const [session, setSession] = createSignal(initial);
  const mounted = render(() => <ApplicationSessionProvider state={session}>
    <HomeRoute claimVideoOutcome={claim} publicData={emptyFeed} homeData={emptyFeed} />
  </ApplicationSessionProvider>);
  return { ...mounted, setSession };
}
const toast = () => document.querySelector<HTMLElement>("[data-video-outcome-toast]");
const settle = async () => { await Promise.resolve(); await flush(); await Promise.resolve(); await flush(); };
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); document.body.replaceChildren(); document.head.replaceChildren(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Home permanent video outcome permission", () => {
  test("pending, anonymous and failed sessions do not claim; resolved Home claims once", async () => {
    const reply = deferred<VideoOutcomeClaim>();
    const claim = vi.fn(() => reply.promise);
    const mounted = home(claim, "resolving");
    await settle(); expect(claim).not.toHaveBeenCalled();
    mounted.setSession("anonymous"); await settle(); expect(claim).not.toHaveBeenCalled();
    mounted.setSession("failed"); await settle(); expect(claim).not.toHaveBeenCalled();
    mounted.setSession(account()); await settle(); expect(claim).toHaveBeenCalledOnce();
    expect(mounted.container.querySelector("[data-home-session='authenticated']")).not.toBeNull();
    expect(toast()).toBeNull();
    reply.resolve(winning()); await settle();
    expect(toast()?.textContent).toBe("Your video couldn't be posted.Record again");
    expect(toast()?.querySelectorAll("button")).toHaveLength(1);
    expect(toast()?.querySelector("[aria-label='Close']")).toBeNull();
  });

  test("Home mounted during a background account check cannot claim with retained authenticated chrome", async () => {
    const claim = vi.fn(async () => winning());
    const [session, setSession] = createSignal(account("previous-author"));
    const [pending, setPending] = createSignal(true);
    const mounted = render(() => <ApplicationSessionProvider state={session} pending={pending}><HomeRoute claimVideoOutcome={claim} publicData={emptyFeed} homeData={emptyFeed} /></ApplicationSessionProvider>);
    await settle(); expect(claim).not.toHaveBeenCalled(); expect(toast()).toBeNull();
    expect(mounted.container.querySelector("[data-home-session='resolving']")).not.toBeNull();
    setSession(account("current-author")); await settle(); expect(claim).not.toHaveBeenCalled();
    setPending(false); await settle(); expect(claim).toHaveBeenCalledOnce(); expect(toast()).not.toBeNull();
    expect(mounted.container.querySelector("[data-home-session='authenticated']")).not.toBeNull();
    setPending(true); await settle(); expect(toast()).toBeNull(); expect(claim).toHaveBeenCalledOnce();
  });

  test("failure and policy block use exact copy/actions and automatically disappear", async () => {
    vi.useFakeTimers();
    const failure = home(async () => winning()); await settle();
    expect(toast()?.textContent).toContain("Your video couldn't be posted.");
    await vi.advanceTimersByTimeAsync(VIDEO_OUTCOME_TOAST_DURATION_MS); await settle(); expect(toast()).toBeNull();
    failure.close();
    home(async () => winning("policy_block")); await settle();
    expect(toast()?.textContent).toBe("Your video wasn't posted because it didn't meet our guidelines.");
    expect(toast()?.querySelector("button")).toBeNull();
    await vi.advanceTimersByTimeAsync(VIDEO_OUTCOME_TOAST_DURATION_MS); await settle(); expect(toast()).toBeNull();
  });

  test("loser/null and errors show nothing and never schedule retry", async () => {
    vi.useFakeTimers();
    const claim = vi.fn().mockResolvedValueOnce(loser).mockRejectedValueOnce(new Error("offline"));
    const mounted = home(claim); await settle(); expect(toast()).toBeNull();
    mounted.setSession(account("another-author")); await settle();
    await vi.advanceTimersByTimeAsync(60_000); await settle();
    expect(toast()).toBeNull(); expect(claim).toHaveBeenCalledTimes(2);
  });

  test("simultaneous Home requests display only the server winner", async () => {
    const reply = winning();
    let permanentlyClaimed = false;
    const serverClaim = vi.fn(async () => {
      if (permanentlyClaimed) return loser;
      permanentlyClaimed = true; return reply;
    });
    home(serverClaim); home(serverClaim); await settle();
    expect(serverClaim).toHaveBeenCalledTimes(2);
    expect(document.querySelectorAll("[data-video-outcome-toast]")).toHaveLength(1);
  });

  test("consumes a winning permission before display and ignores replay after Home remount", async () => {
    const reply = winning();
    const mounted = home(async () => reply); await settle(); expect(toast()).not.toBeNull();
    mounted.close(); home(async () => reply); await settle(); expect(toast()).toBeNull();
  });

  test("out-of-order account replies never show the previous author's result", async () => {
    const first = deferred<VideoOutcomeClaim>(); const second = deferred<VideoOutcomeClaim>();
    const claim = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const mounted = home(claim); await settle();
    mounted.setSession(account("next-author")); await settle();
    first.resolve(winning()); await settle(); expect(toast()).toBeNull();
    second.resolve(winning("policy_block")); await settle(); expect(toast()?.textContent).toContain("guidelines");
    mounted.setSession("resolving"); await settle(); expect(toast()).toBeNull();
  });

  test("session refresh immediately fences replies even while old authenticated chrome remains", async () => {
    const pending = deferred<VideoOutcomeClaim>();
    const claim = vi.fn(() => pending.promise);
    const mounted = home(claim); await settle();
    refreshSession();
    const reply = winning(); pending.resolve(reply); await settle(); expect(toast()).toBeNull();
    expect(claim).toHaveBeenCalledOnce();
    mounted.setSession(account()); await settle(); expect(claim).toHaveBeenCalledTimes(2);
    expect(toast()).toBeNull(); // same winning reply is already consumed
  });

  test("sign-out clears a visible notice and a detached action cannot navigate", async () => {
    const navigate = vi.fn(); const [session, setSession] = createSignal(account());
    render(() => <ApplicationSessionProvider state={session}><HomeRoute navigate={navigate} claimVideoOutcome={async () => winning()} publicData={emptyFeed} homeData={emptyFeed} /></ApplicationSessionProvider>);
    await settle(); const action = toast()?.querySelector("button"); expect(action).toBeDefined();
    setSession("anonymous"); await settle(); action?.click(); await settle(); expect(toast()).toBeNull(); expect(navigate).not.toHaveBeenCalled();
  });

  test.each(["lost-response", "crash-before-display"])("%s permanently loses the notice across a new client with empty storage", async mode => {
    const pending = deferred<VideoOutcomeClaim>();
    let committed = false;
    const serverClaim = vi.fn(() => {
      if (committed) return Promise.resolve(loser);
      committed = true;
      return mode === "lost-response" ? Promise.reject(new Error("acknowledgment lost")) : pending.promise;
    });
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const firstClient = home(serverClaim); await settle(); firstClient.close();
    // No winner is delivered to either client: only server state prevents it.
    if (mode === "crash-before-display") pending.resolve(winning());
    localStorage.clear(); sessionStorage.clear();
    home(serverClaim); await settle();
    expect(toast()).toBeNull(); expect(serverClaim).toHaveBeenCalledTimes(2);
    expect(storage).not.toHaveBeenCalled(); storage.mockRestore();
  });

  test("disposal clears the auto-dismiss timer and ignores a late winning reply", async () => {
    vi.useFakeTimers();
    const shown = home(async () => winning()); await settle(); expect(toast()).not.toBeNull();
    shown.close(); expect(vi.getTimerCount()).toBe(0);
    const pending = deferred<VideoOutcomeClaim>(); const closed = home(() => pending.promise); await settle();
    closed.close(); pending.resolve(winning()); await settle();
    expect(toast()).toBeNull(); expect(vi.getTimerCount()).toBe(0);
  });

  test("returning to the same account never revives an earlier session's winner", async () => {
    const pending = deferred<VideoOutcomeClaim>();
    const claim = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(loser);
    const mounted = home(claim); await settle();
    mounted.setSession("anonymous"); await settle(); mounted.setSession(account()); await settle();
    pending.resolve(winning()); await settle(); expect(toast()).toBeNull(); expect(claim).toHaveBeenCalledTimes(2);
  });

  test("uses the existing locale catalog for policy copy", async () => {
    const resolved = account();
    render(() => <UiLocaleProvider locale="zh"><ApplicationSessionProvider state={() => resolved}><HomeRoute claimVideoOutcome={async () => winning("policy_block")} publicData={emptyFeed} homeData={emptyFeed} /></ApplicationSessionProvider></UiLocaleProvider>);
    await settle(); expect(toast()?.textContent).toBe("你的视频未发布，因为它不符合我们的准则。");
  });
});
