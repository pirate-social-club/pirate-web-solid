import { MegapotPoolUnavailableError } from "../../api/megapot-pool-availability.ts";
import { StudyingSurface } from "../studying/studying-surface.tsx";
import type { StudyingSurfaceState } from "../studying/studying-model.ts";
import { KaraokePracticeSurface } from "../karaoke/karaoke-practice-surface.tsx";
import { render, type JSX } from "@solidjs/web";
import { createSignal } from "solid-js";
import { afterEach, expect, it, vi } from "vitest";
import type { MegapotParticipantData, ParticipantRewardSnapshot, ParticipantScope } from "../../api/megapot-participant-data.ts";
import { clearSession, refreshSession } from "../../api/session.ts";
import { MegapotPoolSummary, MegapotPoolView, MegapotShareStatus } from "./megapot-participant.tsx";
import { poolStatus, participantMessage } from "./megapot-participant-model.ts";
import { participantPool as pool, participantStanding as standing } from "./megapot-participant.fixtures.ts";
const disposers: (() => void)[] = [];
function mount(view: () => JSX.Element) {
  const host = document.createElement("div"); document.body.appendChild(host);
  disposers.push(render(view, host));
  return host;
}
const data = (): MegapotParticipantData => ({ pool: vi.fn(async () => pool), standing: vi.fn(async () => ({ pool, standing })) });
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); vi.unstubAllGlobals(); document.body.replaceChildren(); });
it("distinguishes open funding from a purchased ticket and closes at cutoff", () => {
  expect(poolStatus(pool)).toBe("Pool entries open");
  expect(poolStatus(pool, Date.parse(pool.drawing!.entry_cutoff_at))).toBe("Pool entries closed");
  expect(poolStatus({ ...pool, drawing: { ...pool.drawing!, state: "ticket_purchased" } })).toContain("Ticket purchased");
  expect(poolStatus({ ...pool, leg_status: "paused" })).toBe("Pool entries unavailable");
});
it("labels the gross prize and exposes qualification, count, cutoff and claim terms", async () => {
  const host = mount(() => <MegapotPoolView pool={pool} />);
  await vi.waitFor(() => expect(host.textContent).toContain("Gross prize pool: 150 test USDC"));
  expect(host.textContent).toContain("not your winnings");
  expect(host.textContent).toContain("2 qualifying accounts");
  expect(host.textContent).toContain("70% correct on the first pass");
  expect(host.textContent).toContain("85% coverage");
  expect(host.textContent).not.toContain("Ticket purchased");
});
it("confirms a server-held share and never equates sponsor fallback with a participant share", async () => {
  const host = mount(() => <MegapotShareStatus communityId="community-1" postId="post-1" data={data()} />);
  await vi.waitFor(() => expect(host.textContent).toContain("You have a share in drawing 42"));
  expect(host.textContent).toContain("does not add another share");
  expect(participantMessage({ pool, standing: { ...standing, share_held: false, participant_state: "entry_open", sponsor_fallback_state: "fallback_active" } })).toContain("No share is confirmed");
});
it("clears private results on session refresh and ignores the obsolete in-flight response", async () => {
  let resolve!: (value: ParticipantRewardSnapshot) => void;
  const fake = data();
  fake.standing = vi.fn().mockResolvedValueOnce({ pool, standing })
    .mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockRejectedValueOnce(new Error("signed out"));
  const host = mount(() => <MegapotShareStatus communityId="community-1" postId="post-1" data={fake} />);
  await vi.waitFor(() => expect(host.textContent).toContain("You have a share"));
  // The private result is on screen; a session change must take it down at once.
  refreshSession();
  await vi.waitFor(() => expect(host.textContent).not.toContain("You have a share"));
  await vi.waitFor(() => expect(fake.standing).toHaveBeenCalledTimes(2));
  refreshSession();
  await vi.waitFor(() => expect(host.textContent).toContain("unavailable"));
  resolve({ pool, standing });
  await new Promise(r => setTimeout(r, 0));
  expect(host.textContent).not.toContain("You have a share");
});
it("fences results across a song change, even when the old transport ignores cancellation", async () => {
  let resolve!: (value: ParticipantRewardSnapshot) => void;
  const fake = data();
  fake.standing = vi.fn().mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockRejectedValue(new Error("offline"));
  const [postId, setPostId] = createSignal("post-1");
  const host = mount(() => <MegapotShareStatus communityId="community-1" postId={postId()} data={fake} />);
  await vi.waitFor(() => expect(fake.standing).toHaveBeenCalledOnce());
  setPostId("post-2");
  await vi.waitFor(() => expect(fake.standing).toHaveBeenCalledTimes(2));
  resolve({ pool, standing });
  await vi.waitFor(() => expect(host.textContent).toContain("unavailable"));
  expect(host.textContent).not.toContain("You have a share");
});
it("allows an explicit retry when completion processing has not confirmed a share", async () => {
  const fake = data();
  fake.standing = vi.fn().mockResolvedValueOnce({ pool, standing: { ...standing, share_held: false, participant_state: "entry_open" } }).mockResolvedValueOnce({ pool, standing });
  const host = mount(() => <MegapotShareStatus communityId="community-1" postId="post-1" data={fake} />);
  await vi.waitFor(() => expect(host.textContent).toContain("No share is confirmed"));
  host.querySelector("button")!.click();
  await vi.waitFor(() => expect(host.textContent).toContain("You have a share"));
});
it("defers compact discovery until visible and makes no private requests", async () => {
  let intersect!: IntersectionObserverCallback;
  const observe = vi.fn(), disconnect = vi.fn();
  vi.stubGlobal("IntersectionObserver", class { constructor(callback: IntersectionObserverCallback) { intersect = callback; } observe = observe; disconnect = disconnect; });
  const fake = data();
  const host = mount(() => <MegapotPoolSummary compact communityId="community-1" postId="post-1" data={fake} />);
  await vi.waitFor(() => expect(observe).toHaveBeenCalledOnce());
  expect(fake.pool).not.toHaveBeenCalled();
  // SAFETY: only isIntersecting is consumed; the observer argument is unused.
  intersect([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver);
  await vi.waitFor(() => expect(host.textContent).toContain("Pool entries open"));
  expect(fake.pool).toHaveBeenCalledOnce(); expect(fake.standing).not.toHaveBeenCalled();
});
it("silently omits absent pools without making private requests", async () => {
  const fake = data(); fake.pool = vi.fn(async () => null);
  const host = mount(() => <MegapotShareStatus communityId="community-1" postId="post-1" data={fake} />);
  await vi.waitFor(() => expect(fake.pool).toHaveBeenCalledOnce());
  expect(host.textContent).toBe(""); expect(fake.standing).not.toHaveBeenCalled();
});

it("waits for the actual Study completion surface before reading standing", async () => {
  const fake = data();
  const [state, setState] = createSignal<StudyingSurfaceState>({ kind: "locked" });
  const host = mount(() => <StudyingSurface state={state()} rewardSlot={<MegapotShareStatus communityId="community-1" postId="post-1" data={fake} />} />);
  await new Promise(r => setTimeout(r, 0));
  expect(fake.pool).not.toHaveBeenCalled();
  setState({ kind: "complete", correctCount: 8, scorePercent: 80, totalCount: 10 });
  await vi.waitFor(() => expect(host.textContent).toContain("You have a share"));
  expect(fake.standing).toHaveBeenCalledOnce();
});
it("waits for Karaoke to end and keeps its Continue action beside reward status", async () => {
  const fake = data();
  const [status, setStatus] = createSignal<"idle" | "ended">("idle");
  const host = mount(() => <KaraokePracticeSurface onStartSinging={() => {}} title="Reward song" lines={[]} singingStatus={status()} onExit={() => {}} rewardSlot={<MegapotShareStatus communityId="community-1" postId="post-1" data={fake} />} />);
  await new Promise(r => setTimeout(r, 0));
  expect(fake.pool).not.toHaveBeenCalled();
  setStatus("ended");
  await vi.waitFor(() => expect(host.textContent).toContain("You have a share"));
  expect([...host.querySelectorAll("button")].some(button => button.textContent?.includes("Continue"))).toBe(true);
});

it("does not promise a later share after entries close", async () => {
  const snapshot = { pool: { ...pool, drawing: { ...pool.drawing!, state: "entry_closed" as const } }, standing: { ...standing, share_held: false, participant_state: "entry_closed" as const } };
  const host = mount(() => <MegapotShareStatus communityId="community-1" postId="post-1" data={{ pool: async () => snapshot.pool, standing: async () => snapshot }} />);
  await vi.waitFor(() => expect(host.textContent).toContain("Entries are closed"));
  expect(host.textContent).toContain("Play again when the next drawing opens");
  expect(host.textContent).not.toContain("pending");
  expect(host.textContent).not.toContain("You have a share");
});

it("keeps open-drawing copy neutral about qualification and distinguishes a hold from closure", () => {
  expect(participantMessage({ pool, standing: { ...standing, share_held: false, participant_state: "entry_open" } })).toContain("Only qualifying activities earn a share");
  expect(participantMessage({ pool, standing: { ...standing, share_held: false, participant_state: "operational_hold" } })).toContain("on hold");
  expect(participantMessage({ pool: { ...pool, drawing: null }, standing: { ...standing, share_held: false, drawing_id: null, participant_state: "entry_closed" } })).toContain("No drawing is currently open");
  expect(participantMessage({ pool: { ...pool, drawing: { ...pool.drawing!, entry_cutoff_at: "2000-01-01T00:00:00Z" } }, standing: { ...standing, share_held: false, participant_state: "entry_open" } })).not.toContain("pending");
});

const settle = () => new Promise(resolve => setTimeout(resolve, 0));
function setVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
  document.dispatchEvent(new Event("visibilitychange"));
}
// Restore jsdom's own getter so a later test starts visible.
afterEach(() => { Reflect.deleteProperty(document, "visibilityState"); vi.restoreAllMocks(); });

it.each([
  ["a disabled or unavailable provider", () => new MegapotPoolUnavailableError()],
  ["a failed read", () => new Error("offline")],
])("renders nothing on a completion surface when the initial pool lookup meets %s", async (_label, failure) => {
  const fake = data();
  fake.pool = vi.fn(async () => { throw failure(); });
  const host = mount(() => <StudyingSurface state={{ kind: "complete", correctCount: 8, scorePercent: 80, totalCount: 10 }} rewardSlot={<MegapotShareStatus communityId="community-1" postId="post-1" data={fake} />} />);
  await vi.waitFor(() => expect(fake.pool).toHaveBeenCalledOnce());
  await settle();
  expect(host.querySelector("[data-megapot-share]")).toBeNull();
  expect(host.textContent).not.toContain("Megapot");
  expect(host.textContent).not.toContain("unavailable");
  expect(fake.standing).not.toHaveBeenCalled();
});

it("shows a retryable error only after a pool has been observed for the song", async () => {
  const fake = data();
  fake.pool = vi.fn().mockResolvedValueOnce(pool).mockRejectedValueOnce(new MegapotPoolUnavailableError()).mockResolvedValue(pool);
  const host = mount(() => <MegapotShareStatus communityId="community-1" postId="post-1" data={fake} />);
  await vi.waitFor(() => expect(host.textContent).toContain("You have a share"));
  host.querySelector("button")!.click();
  await vi.waitFor(() => expect(host.textContent).toContain("temporarily unavailable"));
  expect(host.textContent).not.toContain("You have a share");
  expect(host.querySelector("button")!.disabled).toBe(false);
  host.querySelector("button")!.click();
  await vi.waitFor(() => expect(host.textContent).toContain("You have a share"));
  expect(fake.pool).toHaveBeenCalledTimes(3);
});

it("forgets an observed pool when the song changes", async () => {
  const fake = data();
  fake.pool = vi.fn(async (scope: ParticipantScope) => { if (scope.postId === "post-2") throw new MegapotPoolUnavailableError(); return pool; });
  const [postId, setPostId] = createSignal("post-1");
  const host = mount(() => <MegapotShareStatus communityId="community-1" postId={postId()} data={fake} />);
  await vi.waitFor(() => expect(host.textContent).toContain("You have a share"));
  setPostId("post-2");
  await vi.waitFor(() => expect(fake.pool).toHaveBeenCalledTimes(2));
  await settle();
  expect(host.textContent).toBe("");
});

it("forgets an observed pool after an authoritative no-pool reply", async () => {
  const fake = data();
  fake.pool = vi.fn().mockResolvedValueOnce(pool).mockResolvedValueOnce(null).mockRejectedValue(new Error("offline"));
  const host = mount(() => <MegapotShareStatus communityId="community-1" postId="post-1" data={fake} />);
  await vi.waitFor(() => expect(host.textContent).toContain("You have a share"));
  refreshSession();
  await vi.waitFor(() => expect(fake.pool).toHaveBeenCalledTimes(2));
  await settle();
  expect(host.textContent).toBe("");
  refreshSession();
  await vi.waitFor(() => expect(fake.pool).toHaveBeenCalledTimes(3));
  await settle();
  expect(host.textContent).toBe("");
});

it("drops private standing when hidden and reloads when visible again without a focus event", async () => {
  const fake = data();
  const host = mount(() => <MegapotShareStatus communityId="community-1" postId="post-1" data={fake} />);
  await vi.waitFor(() => expect(host.textContent).toContain("You have a share"));
  setVisibility("hidden");
  await vi.waitFor(() => expect(host.textContent).toBe(""));
  await settle();
  expect(fake.pool).toHaveBeenCalledOnce();
  setVisibility("visible");
  await vi.waitFor(() => expect(host.textContent).toContain("You have a share"));
  expect(fake.pool).toHaveBeenCalledTimes(2);
  expect(fake.standing).toHaveBeenCalledTimes(2);
});

it.each([
  ["visibility then focus", () => { setVisibility("visible"); window.dispatchEvent(new Event("focus")); }],
  ["focus then visibility", () => { window.dispatchEvent(new Event("focus")); setVisibility("visible"); }],
])("reloads once and cancels nothing when returning fires %s", async (_label, comeBack) => {
  const fake = data();
  const signals: AbortSignal[] = [];
  fake.pool = vi.fn(async (_scope: ParticipantScope, signal: AbortSignal) => { signals.push(signal); return pool; });
  const host = mount(() => <MegapotShareStatus communityId="community-1" postId="post-1" data={fake} />);
  await vi.waitFor(() => expect(host.textContent).toContain("You have a share"));
  setVisibility("hidden");
  comeBack();
  await vi.waitFor(() => expect(host.textContent).toContain("You have a share"));
  await settle();
  expect(fake.pool).toHaveBeenCalledTimes(2);
  expect(fake.standing).toHaveBeenCalledTimes(2);
  expect(signals[1]!.aborted).toBe(false);
});

it("still reloads on a later focus once the previous load has settled", async () => {
  const fake = data();
  let now = 10_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const host = mount(() => <MegapotShareStatus communityId="community-1" postId="post-1" data={fake} />);
  await vi.waitFor(() => expect(host.textContent).toContain("You have a share"));
  window.dispatchEvent(new Event("focus"));
  await settle();
  expect(fake.pool).toHaveBeenCalledOnce();
  now += 1_000;
  window.dispatchEvent(new Event("focus"));
  await vi.waitFor(() => expect(fake.pool).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(host.textContent).toContain("You have a share"));
});

it("does not imply that a below-threshold Study completion is awaiting a share", async () => {
  const fake = data();
  fake.standing = vi.fn(async (): Promise<ParticipantRewardSnapshot> => ({ pool, standing: { ...standing, share_held: false, participant_state: "entry_open" } }));
  const host = mount(() => <StudyingSurface state={{ kind: "complete", correctCount: 5, scorePercent: 50, totalCount: 10 }} rewardSlot={<MegapotShareStatus communityId="community-1" postId="post-1" data={fake} />} />);
  await vi.waitFor(() => expect(host.textContent).toContain("No share is confirmed"));
  expect(host.textContent).toContain("Only qualifying activities earn a share");
  expect(host.textContent).not.toContain("pending");
  expect(host.textContent).not.toContain("You have a share");
});

it("renders nothing and asks nothing for a song without a community id", async () => {
  const fake = data();
  // A route fixture or a partial response can omit the community; these surfaces must survive it.
  const partial: Partial<ParticipantScope> = { postId: "post-1" };
  const host = mount(() => <>
    <MegapotPoolSummary communityId={partial.communityId!} postId="post-1" data={fake} />
    <MegapotShareStatus communityId={partial.communityId!} postId="post-1" data={fake} />
  </>);
  await settle();
  expect(host.textContent).toBe("");
  expect(fake.pool).not.toHaveBeenCalled();
  expect(fake.standing).not.toHaveBeenCalled();
});

it("treats an account with no standing in the pool as having no share, not as a failure", async () => {
  const closed = { ...pool, drawing: { ...pool.drawing!, state: "entry_closed" as const } };
  expect(participantMessage({ pool, standing: null })).toContain("Only qualifying activities earn a share");
  expect(participantMessage({ pool: closed, standing: null })).toContain("Entries are closed");
  expect(participantMessage({ pool: { ...pool, drawing: null }, standing: null })).toContain("No drawing is currently open");
  const fake = data();
  fake.standing = vi.fn(async (): Promise<ParticipantRewardSnapshot> => ({ pool, standing: null }));
  const host = mount(() => <MegapotShareStatus communityId="community-1" postId="post-1" data={fake} />);
  await vi.waitFor(() => expect(host.textContent).toContain("No share is confirmed"));
  expect(host.textContent).not.toContain("unavailable");
  expect(host.textContent).not.toContain("Open Wallet");
});

it("does not tell a winner the amount will be held if the pool wins", async () => {
  const fake = data();
  fake.standing = vi.fn(async (): Promise<ParticipantRewardSnapshot> => ({ pool, standing: { ...standing, participant_state: "won" } }));
  const host = mount(() => <MegapotShareStatus communityId="community-1" postId="post-1" data={fake} />);
  await vi.waitFor(() => expect(host.textContent).toContain("Your share won"));
  expect(host.textContent).not.toContain("If your pool wins");
  expect(host.textContent).toContain("Open Wallet");
});

it("counts one qualifying account in the singular", () => {
  const host = mount(() => <MegapotPoolView pool={{ ...pool, drawing: { ...pool.drawing!, beneficiary_count: 1 } }} compact />);
  expect(host.textContent).toContain("1 qualifying account ·");
});

it("stops its clock and its read when a full pool summary is removed", async () => {
  const signals: AbortSignal[] = [];
  const fake = data();
  fake.pool = vi.fn(async (_scope: ParticipantScope, signal: AbortSignal) => { signals.push(signal); return pool; });
  const cleared = vi.spyOn(globalThis, "clearInterval");
  const started = vi.spyOn(globalThis, "setInterval");
  const host = mount(() => <MegapotPoolSummary communityId="community-1" postId="post-1" data={fake} />);
  await vi.waitFor(() => expect(host.textContent).toContain("Pool entries open"));
  const clock = started.mock.results.at(-1)!.value;
  disposers.splice(0).forEach(dispose => dispose());
  expect(cleared).toHaveBeenCalledWith(clock);
  expect(signals[0]!.aborted).toBe(true);
});

it("disconnects its observer when a card's pool summary is removed before it was seen", async () => {
  const observe = vi.fn(), disconnect = vi.fn();
  vi.stubGlobal("IntersectionObserver", class { observe = observe; disconnect = disconnect; });
  const fake = data();
  mount(() => <article><MegapotPoolSummary compact communityId="community-1" postId="post-1" data={fake} /></article>);
  await vi.waitFor(() => expect(observe).toHaveBeenCalledOnce());
  // The empty host is hidden, so the card around it is what is watched.
  const watched: unknown = observe.mock.calls[0]![0];
  expect(watched instanceof Element && watched.tagName).toBe("ARTICLE");
  disposers.splice(0).forEach(dispose => dispose());
  expect(disconnect).toHaveBeenCalled();
  expect(fake.pool).not.toHaveBeenCalled();
});

it("removes its window, document and session listeners when the share status is removed", async () => {
  const fake = data();
  const windowRemoved = vi.spyOn(window, "removeEventListener");
  const documentRemoved = vi.spyOn(document, "removeEventListener");
  const host = mount(() => <MegapotShareStatus communityId="community-1" postId="post-1" data={fake} />);
  await vi.waitFor(() => expect(host.textContent).toContain("You have a share"));
  disposers.splice(0).forEach(dispose => dispose());
  expect(windowRemoved.mock.calls.some(call => call[0] === "focus")).toBe(true);
  expect(documentRemoved.mock.calls.some(call => call[0] === "visibilitychange")).toBe(true);
  refreshSession();
  window.dispatchEvent(new Event("focus"));
  await settle();
  expect(fake.pool).toHaveBeenCalledOnce();
});

it("keeps the box in place while a known pool reloads", async () => {
  let release!: (value: ParticipantRewardSnapshot) => void;
  const fake = data();
  fake.standing = vi.fn().mockResolvedValueOnce({ pool, standing }).mockImplementationOnce(() => new Promise(r => { release = r; }));
  const host = mount(() => <MegapotShareStatus communityId="community-1" postId="post-1" data={fake} />);
  await vi.waitFor(() => expect(host.textContent).toContain("You have a share"));
  host.querySelector("button")!.click();
  await vi.waitFor(() => expect(host.textContent).toContain("Checking your share"));
  expect(host.textContent).not.toContain("You have a share");
  expect(host.querySelector("[data-megapot-share]")).not.toBeNull();
  release({ pool, standing });
  await vi.waitFor(() => expect(host.textContent).toContain("You have a share"));
});

// The real data, client and session modules: only fetch is replaced.
function realSessionPath() {
  clearSession(); refreshSession();
  const session = { signedIn: false };
  const calls = { pool: 0, account: 0, standing: 0 };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(input instanceof Request ? input.url : input.toString()).pathname;
    if (path.endsWith("/rewards/megapot-pool")) { calls.pool += 1; return Response.json({ pool }); }
    if (path.endsWith("/standing")) { calls.standing += 1; return Response.json({ standing }); }
    if (path === "/api/users/me") {
      calls.account += 1;
      // Past this, the surface is reloading itself: fail loudly instead of hanging the suite.
      if (calls.account > 12) return new Response("loop", { status: 500 });
      return session.signedIn
        ? Response.json({
          id: "account-1", object: "user", verification_state: "unverified", created: 1,
          verification_capabilities: Object.fromEntries(["unique_human", "age_over_18", "minimum_age", "nationality", "gender", "wallet_score"].map(name => [name, { state: "unverified" }])),
        })
        : new Response(JSON.stringify({ error: { code: "auth_error", message: "Authentication required", retryable: false } }),
          { status: 401, headers: { "content-type": "application/json; charset=UTF-8" } });
    }
    return new Response("unexpected", { status: 500 });
  }));
  return { session, calls };
}
const settled = () => new Promise(resolve => setTimeout(resolve, 300));
it("makes no private read for a signed-out viewer, and loads the share after sign-in", async () => {
  const { session, calls } = realSessionPath();
  const host = mount(() => <MegapotShareStatus communityId="community-1" postId="post-1" />);
  await vi.waitFor(() => expect(calls.account).toBeGreaterThanOrEqual(1));
  await settled();
  // The public pool read, and the session store's own account read. The surface asks nothing private.
  expect(calls).toEqual({ pool: 1, account: 1, standing: 0 });
  expect(host.querySelector("[data-megapot-share]")).toBeNull();
  // Still settled a moment later: nothing is repeating in the background.
  await settled();
  expect(calls).toEqual({ pool: 1, account: 1, standing: 0 });
  session.signedIn = true;
  refreshSession();
  await vi.waitFor(() => expect(host.textContent).toContain("You have a share"));
  expect(calls).toEqual({ pool: 3, account: 4, standing: 1 });
});
it("takes the share down when the server refuses an established session, and does not ask again", async () => {
  const { session, calls } = realSessionPath();
  session.signedIn = true;
  const host = mount(() => <MegapotShareStatus communityId="community-1" postId="post-1" />);
  await vi.waitFor(() => expect(host.textContent).toContain("You have a share"));
  expect(calls).toEqual({ pool: 2, account: 3, standing: 1 });
  // The server now refuses the session and nothing can renew it.
  session.signedIn = false;
  [...host.querySelectorAll("button")].find(button => button.textContent === "Check reward status")!.click();
  await vi.waitFor(() => expect(calls.account).toBe(4));
  await settled();
  // The check read the pool and was refused on the account read. The refusal announced one
  // refresh; that reload read the pool, asked the session store and stopped there.
  expect(calls).toEqual({ pool: 4, account: 4, standing: 1 });
  expect(host.querySelector("[data-megapot-share]")).toBeNull();
  await settled();
  expect(calls).toEqual({ pool: 4, account: 4, standing: 1 });
});
it("takes the share down on sign-out without another read, and asks nothing private on return", async () => {
  const { session, calls } = realSessionPath();
  session.signedIn = true;
  const host = mount(() => <MegapotShareStatus communityId="community-1" postId="post-1" />);
  await vi.waitFor(() => expect(host.textContent).toContain("You have a share"));
  session.signedIn = false;
  clearSession();
  await vi.waitFor(() => expect(host.querySelector("[data-megapot-share]")).toBeNull());
  await settled();
  expect(calls).toEqual({ pool: 2, account: 3, standing: 1 });
  // Returning to the page reads the public pool again and stops at the session store.
  window.dispatchEvent(new Event("focus"));
  await vi.waitFor(() => expect(calls.pool).toBe(3));
  await settled();
  expect(calls).toEqual({ pool: 3, account: 3, standing: 1 });
  expect(host.querySelector("[data-megapot-share]")).toBeNull();
});
