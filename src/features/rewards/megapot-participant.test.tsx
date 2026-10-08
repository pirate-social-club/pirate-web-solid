import { StudyingSurface } from "../studying/studying-surface.tsx";
import type { StudyingSurfaceState } from "../studying/studying-model.ts";
import { KaraokePracticeSurface } from "../karaoke/karaoke-practice-surface.tsx";
import { render, type JSX } from "@solidjs/web";
import { createSignal } from "solid-js";
import { afterEach, expect, it, vi } from "vitest";
import type { MegapotParticipantData, ParticipantRewardSnapshot } from "../../api/megapot-participant-data.ts";
import { refreshSession } from "../../api/session.ts";
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
  expect(participantMessage({ pool, standing: { ...standing, share_held: false, sponsor_fallback_state: "fallback_active" } })).toContain("No share is confirmed");
});
it("clears private results on session refresh and ignores the obsolete in-flight response", async () => {
  let resolve!: (value: ParticipantRewardSnapshot) => void;
  const fake = data();
  fake.standing = vi.fn().mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockRejectedValueOnce(new Error("signed out"));
  const host = mount(() => <MegapotShareStatus communityId="community-1" postId="post-1" data={fake} />);
  await vi.waitFor(() => expect(fake.standing).toHaveBeenCalledOnce());
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
  fake.standing = vi.fn().mockResolvedValueOnce({ pool, standing: { ...standing, share_held: false } }).mockResolvedValueOnce({ pool, standing });
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
