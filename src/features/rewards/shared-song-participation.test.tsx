import { render, type JSX } from "@solidjs/web";
import { createSignal } from "solid-js";
import { afterEach, expect, it, vi } from "vitest";
import type { SharedSongDrawing, SharedSongParticipation, SharedSongParticipationData } from "../../api/shared-song-participation.ts";
import { clearSession, refreshSession } from "../../api/session.ts";
import { SharedSongParticipationStatus, SharedSongParticipationView } from "./shared-song-participation.tsx";
import { sharedSongDrawingStatus, sharedSongRule, sharedSongStanding } from "./shared-song-participation-model.ts";
import { sharedSongParticipationFixture } from "./shared-song-participation.fixtures.ts";

const disposers: (() => void)[] = [];
function mount(view: () => JSX.Element) {
  const host = document.createElement("div"); document.body.appendChild(host); disposers.push(render(view, host)); return host;
}
const scope = { communityId: "test-community", postId: "test-song" };
const fixture = () => sharedSongParticipationFixture();
const now = Date.parse("2099-10-22T12:00:00.000Z");
function first(value = fixture()): Extract<SharedSongDrawing, { kind: "materialized" }> {
  const row = value.drawings[0]; if (row.kind !== "materialized") throw new Error("fixture drawing missing"); return row;
}
function history(): SharedSongParticipation {
  const value = fixture(), row = first(value);
  const winner = { ...row, drawing: { ...row.drawing, state: "won" as const, lifecycle_status: "credited" as const, beneficiary_count: 2, net_winnings_atomic: "900001" }, standing: { share_held: true, credit: { credit_id: "test-credit", amount_atomic: "450000", state: "credited" as const, claim: { status: "unclaimed" as const, payout_status: null } } } };
  return { ...value, drawings: [winner, value.drawings[1]] };
}
function setVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
  document.dispatchEvent(new Event("visibilitychange"));
}
afterEach(() => {
  disposers.splice(0).forEach(dispose => dispose()); document.body.replaceChildren();
  Reflect.deleteProperty(document, "visibilityState"); vi.useRealTimers(); vi.restoreAllMocks();
});
it("discloses frozen rules, separate pool floors, categorical Dance and test asset without inventing an amount", async () => {
  const value = fixture();
  const host = mount(() => <SharedSongParticipationView participation={value} now={now} />);
  await vi.waitFor(() => expect(host.textContent).toContain("not an extra ticket"));
  expect(host.textContent).toContain("Additional pool score floor: 80%");
  expect(host.textContent).toContain("70% correct on the first pass");
  expect(host.textContent).toContain("85% coverage");
  expect(host.textContent).toContain("no numeric Dance score");
  expect(host.textContent).toContain("Earlier practice cannot be upgraded");
  expect(host.textContent).toContain("separate from creator and collaborator earnings");
  expect(host.textContent).toContain("test USDC has no spendable value");
  expect(host.textContent).toContain("Pirate holds the song’s ticket");
  expect(host.textContent).toContain("allocation is credited first");
  expect(host.textContent).toContain("Entry window closes in 4h 55m 0s");
  expect(host.textContent).not.toContain("Your confirmed allocation");
  expect(host.querySelector('a[href="/wallet"]')).toBeNull();
});
it("retains an earlier exact positive credit beside later planned drawings and navigates without auto-Claim", async () => {
  const value = history(), later = first();
  const live = { ...value, terms: { ...value.terms, last_planned_drawing_id: "202", planned_drawing_ids: ["200", "201", "202"] }, drawings: [value.drawings[0], { ...later, planned_drawing_id: "201", drawing: { ...later.drawing, drawing_id: "201" } }, { kind: "not_open" as const, planned_drawing_id: "202" }] };
  const host = mount(() => <SharedSongParticipationView participation={live} now={now} />);
  await vi.waitFor(() => expect(host.textContent).toContain("Your confirmed allocation: 0.45 test USDC"));
  expect(host.querySelectorAll("[data-planned-drawing]")).toHaveLength(3);
  expect(host.textContent).toContain("Drawing 201 · Entries open");
  expect(host.textContent).toContain("Drawing 202 · Not opened");
  expect(host.textContent).not.toContain("0.4500005");
  expect(host.querySelector("a")?.getAttribute("href")).toBe("/wallet");
  expect(host.textContent).toContain("allocation is net of Megapot’s observed referral win share");
  expect(host.querySelectorAll("button")).toHaveLength(0);
});
it("makes a locally elapsed cutoff close entries without promising a new share", () => {
  const row = first(); const cutoff = Date.parse(row.drawing.entry_cutoff_at);
  expect(sharedSongDrawingStatus(row, cutoff - 1)).toBe("Entries open");
  expect(sharedSongDrawingStatus(row, cutoff)).toContain("Entries closed");
  expect(sharedSongStanding(row, cutoff)).toBe("Your account has no confirmed share in this drawing.");
  expect(sharedSongStanding({ ...row, standing: { share_held: true, credit: null }, drawing: { ...row.drawing, state: "won" } }, now)).toContain("allocation is not yet confirmed");
  expect(sharedSongDrawingStatus({ ...row, drawing: { ...row.drawing, lifecycle_status: "closed_no_entries" } }, now)).toContain("no ticket purchased");
});
it("ends the entry countdown at the safe cutoff without using the later drawing time", async () => {
  const value = fixture(), row = first(value), cutoff = Date.parse(row.drawing.entry_cutoff_at);
  const [time, setTime] = createSignal(cutoff - 1_000);
  const host = mount(() => <SharedSongParticipationView participation={value} now={time()} />);
  await vi.waitFor(() => expect(host.textContent).toContain("Entry window closes in 0h 0m 1s"));
  setTime(cutoff); await vi.waitFor(() => expect(host.textContent).toContain("Entry window closed."));
  expect(host.textContent).not.toContain("Entries open");
});
it("keeps historical terms and credit when new participation or a funded policy is unavailable", async () => {
  const value = history();
  const host = mount(() => <SharedSongParticipationView participation={{ ...value, participation_available: false, qualification_rules: value.qualification_rules.map(rule => ({ ...rule, currently_available: false })) }} now={now} />);
  await vi.waitFor(() => expect(host.textContent).toContain("New participation is currently unavailable"));
  expect(host.textContent).toContain("Your confirmed allocation: 0.45 test USDC");
  expect(host.textContent).toContain("funded policy is currently unavailable");
});
it("does not infer a Dance rubric or numeric score and labels Mainnet only from the returned asset", async () => {
  const value = fixture();
  expect(sharedSongRule(value.qualification_rules[2])).toContain("Any choreography accepted by that policy");
  expect(sharedSongRule(value.qualification_rules[2])).not.toContain("80%");
  const host = mount(() => <SharedSongParticipationView participation={{ ...history(), chain_id: 8453 }} now={now} />);
  await vi.waitFor(() => expect(host.textContent).toContain("0.45 USDC"));
  expect(host.textContent).not.toContain("test USDC");
});
it.each([
  ["unclaimed", null, "held for you"], ["subject_conflict", null, "remain held"],
  ["accepted", "pending", "payout to your wallet is pending"], ["accepted", "recipient_pending", "wallet to be ready"],
  ["accepted", "failed_retrying", "will retry"], ["accepted", "confirmed", "sent to your wallet"],
] as const)("renders existing Claim vocabulary %s/%s without starting a command", (status, payout_status, text) => {
  const row = first(history()); const credit = row.standing.credit!;
  expect(sharedSongStanding({ ...row, standing: { share_held: true, credit: { ...credit, claim: { status, payout_status } } } }, now)).toContain(text);
  expect(sharedSongStanding({ ...row, standing: { share_held: true, credit: { ...credit, state: "reconciliation_required", claim: { status, payout_status } } } }, now)).toContain("reconciliation");
});
it.each([null, new Error("Rewards off")])("silently omits an absent or initially unavailable pot", async result => {
  const read = vi.fn(async () => { if (result instanceof Error) throw result; return result; });
  const host = mount(() => <SharedSongParticipationStatus {...scope} data={{ read }} />);
  await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
  expect(host.querySelector("[data-shared-song-participation]")).toBeNull();
});
it("clears old amounts before a failed refresh and allows an explicit fresh read", async () => {
  const read = vi.fn().mockResolvedValueOnce(history()).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(fixture());
  const host = mount(() => <SharedSongParticipationStatus {...scope} data={{ read }} />);
  await vi.waitFor(() => expect(host.textContent).toContain("0.45 test USDC"));
  host.querySelector("button")!.click();
  await vi.waitFor(() => expect(host.textContent).toContain("status is unavailable"));
  expect(host.textContent).not.toContain("0.45 test USDC");
  host.querySelector("button")!.click();
  await vi.waitFor(() => expect(host.textContent).toContain("No share is confirmed"));
  expect(read).toHaveBeenCalledTimes(3);
});
it("discards an old song response even if it ignores abort and the new target fails", async () => {
  let finish!: (value: SharedSongParticipation) => void;
  const read = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockRejectedValue(new Error("offline"));
  const [post, setPost] = createSignal(scope.postId);
  const host = mount(() => <SharedSongParticipationStatus communityId={scope.communityId} postId={post()} data={{ read }} />);
  await vi.waitFor(() => expect(read).toHaveBeenCalledOnce()); setPost("other-song");
  await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2)); finish(history());
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(host.textContent).not.toContain("0.45");
});
it("removes private results on sign-out and never republishes the prior response after refresh", async () => {
  let finish!: (value: SharedSongParticipation) => void;
  const read = vi.fn().mockResolvedValueOnce(history()).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue(null);
  const host = mount(() => <SharedSongParticipationStatus {...scope} data={{ read }} />);
  await vi.waitFor(() => expect(host.textContent).toContain("0.45")); refreshSession();
  await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  expect(host.textContent).not.toContain("0.45"); clearSession(); finish(history());
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(host.textContent).toBe(""); expect(read).toHaveBeenCalledTimes(2);
});
it("drops private history while hidden and coalesces visible/focus recovery", async () => {
  const read = vi.fn(async () => history());
  const host = mount(() => <SharedSongParticipationStatus {...scope} data={{ read }} />);
  await vi.waitFor(() => expect(host.textContent).toContain("0.45")); setVisibility("hidden");
  await vi.waitFor(() => expect(host.textContent).not.toContain("0.45"));
  // Even an immediate return earns one fresh read; the old coalescing window
  // must not leave a cleared page stranded without a retry control.
  setVisibility("visible"); window.dispatchEvent(new Event("focus"));
  await vi.waitFor(() => expect(host.textContent).toContain("0.45")); expect(read).toHaveBeenCalledTimes(2);
});
it("expires the private snapshot and clears it before back/forward-cache entry", async () => {
  vi.useFakeTimers();
  const data: SharedSongParticipationData = { read: vi.fn(async () => history()) };
  const host = mount(() => <SharedSongParticipationStatus {...scope} data={data} />);
  await vi.advanceTimersByTimeAsync(1);
  expect(host.textContent).toContain("0.45"); await vi.advanceTimersByTimeAsync(60_000);
  expect(host.textContent).not.toContain("0.45"); expect(host.textContent).toContain("Check again for your latest");
  window.dispatchEvent(new Event("pagehide")); await vi.advanceTimersByTimeAsync(0);
  expect(host.textContent).toBe("");
});
it("bounds a hung refresh even when the transport never rejects on abort", async () => {
  vi.useFakeTimers();
  const read = vi.fn().mockResolvedValueOnce(history()).mockImplementationOnce(() => new Promise(() => {}));
  const host = mount(() => <SharedSongParticipationStatus {...scope} data={{ read }} />);
  await vi.advanceTimersByTimeAsync(1); expect(host.textContent).toContain("0.45");
  host.querySelector("button")!.click(); await vi.advanceTimersByTimeAsync(15_001);
  expect(host.textContent).toContain("status is unavailable"); expect(host.textContent).not.toContain("0.45");
  expect(host.querySelector("button")?.disabled).toBe(false);
});
