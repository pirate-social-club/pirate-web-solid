import { expect, test, vi } from "vitest";
import { contributionJournalKey } from "./song-contribution-journal.ts";
import { contributionFixtures as f } from "./song-contributions.fixture.ts";
import { contributionControllerFixture as fixture } from "../../test/fixtures/song-contribution-controller.ts";

async function reserved(h: ReturnType<typeof fixture>) {
  const controller = h.controller(); await controller.reviewAmount("2000000"); await controller.reserve(); return controller;
}
async function payable(h: ReturnType<typeof fixture>) {
  const controller = await reserved(h), view = await controller.preparePayment();
  if (view.kind !== "pay") throw new Error("fixture_pay_review_missing"); return { controller, review: view };
}

test("opening and reviewing reads context without allocating a command or touching a wallet", async () => {
  const h = fixture(), controller = h.controller();
  expect((await controller.open()).kind).toBe("amount");
  const review = await controller.reviewAmount("2000000"); expect(review.kind).toBe("terms");
  expect(h.api.create).not.toHaveBeenCalled(); expect(h.journal().read()).toBeNull(); expect(h.wallet.estimate).not.toHaveBeenCalled();
});
test.each(["0", "1.5", "999999", "6000001", (2n ** 256n).toString()])("rejects out-of-range amount %s before reservation", async amount => {
  const h = fixture(); await expect(h.controller().reviewAmount(amount)).rejects.toThrow("amount_invalid"); expect(h.api.create).not.toHaveBeenCalled();
});
test("expired review never initializes or posts a contribution", async () => {
  const h = fixture(), controller = h.controller(); await controller.reviewAmount("2000000"); h.advance(120_000);
  await expect(controller.reserve()).rejects.toThrow("review_expired"); expect(h.journal().read()).toBeNull(); expect(h.api.create).not.toHaveBeenCalled();
});
test("a reservation stores original bytes before posting and does not sign", async () => {
  const h = fixture(), controller = await reserved(h);
  expect(controller.state.kind).toBe("status"); expect(h.api.create).toHaveBeenCalledTimes(1); expect(h.wallet.send).not.toHaveBeenCalled();
  expect(h.journal().read()?.contributionId).toBe(f.receipt.contribution_id);
});
test("a lost creation acknowledgement is recovered by reads without a new quote, POST or nonce", async () => {
  const h = fixture(), controller = h.controller(); h.setCreation("after"); await controller.reviewAmount("2000000");
  await expect(controller.reserve()).rejects.toThrow("response_lost_after_commit"); const original = h.journal().read()?.commands[0]?.bodyJson;
  const restored = await h.controller().open(); expect(restored.kind).toBe("status");
  expect(h.api.create).toHaveBeenCalledTimes(1); expect(h.journal().read()?.commands[0]?.bodyJson).toBe(original); expect(h.wallet.send).not.toHaveBeenCalled();
});
test("a read miss preserves an unknown original request; only explicit retry resends those bytes", async () => {
  const h = fixture(), controller = h.controller(); h.setCreation("before"); await controller.reviewAmount("2000000");
  await expect(controller.reserve()).rejects.toThrow(); const raw = h.journal().read()?.commands[0]?.bodyJson;
  const reopened = h.controller(); expect((await reopened.open()).kind).toBe("pending"); expect(h.api.create).toHaveBeenCalledTimes(1);
  h.setCreation("ok"); await reopened.retryOriginalCommand(); expect(h.api.create).toHaveBeenCalledTimes(2);
  expect(h.journal().read()?.commands[0]?.bodyJson).toBe(raw); expect(h.api.create).toHaveBeenNthCalledWith(2, vi.mocked(h.api.create).mock.calls[0]?.[0], expect.any(AbortSignal));
});
test("two tabs that reviewed the amount serialize reservation into one original contribution", async () => {
  const h = fixture(), first = h.controller(), second = h.controller();
  await first.reviewAmount("2000000"); await second.reviewAmount("2000000"); await Promise.all([first.reserve(), second.reserve()]);
  expect(h.api.create).toHaveBeenCalledTimes(1); expect(h.journal().read()?.commands).toHaveLength(1);
});
test("explicit Pay grants once, persists before wallet dispatch, then observes the original hash", async () => {
  const h = fixture(), { controller, review } = await payable(h); expect(h.wallet.send).not.toHaveBeenCalled();
  await controller.confirmPayment(review.reviewId);
  expect(h.walletInvocations()).toBe(1); expect(h.api.claim).toHaveBeenCalledTimes(1); expect(h.api.observe).toHaveBeenCalledTimes(1);
  expect(h.journal().read()?.invocations[0]?.transactionHash).toBe(f.observationRequest.transaction_hash);
  await h.controller().open(); expect(h.walletInvocations()).toBe(1);
});
test("a changed server revision invalidates Pay before a claim or wallet", async () => {
  const h = fixture(), { controller, review } = await payable(h); h.setCurrent({ ...h.current(), revision: 10 });
  await expect(controller.confirmPayment(review.reviewId)).rejects.toThrow("review_changed"); expect(h.api.claim).not.toHaveBeenCalled(); expect(h.walletInvocations()).toBe(0);
});
test("a recovered grant cannot reach the wallet", async () => {
  const h = fixture(), { controller, review } = await payable(h); h.setClaim("replayed"); await controller.confirmPayment(review.reviewId);
  expect(h.wallet.send).not.toHaveBeenCalled(); expect(h.journal().read()?.invocations).toEqual([]);
});
test("a lost claim acknowledgement reloads as recovery only and cannot request a second funding grant", async () => {
  const h = fixture(), { controller, review } = await payable(h); h.setClaim("after");
  await expect(controller.confirmPayment(review.reviewId)).rejects.toThrow("claim_response_lost");
  const reopened = h.controller(); await reopened.open(); await expect(reopened.preparePayment()).rejects.toThrow("original_submission_pending");
  expect(h.api.claim).toHaveBeenCalledTimes(1); expect(h.wallet.send).not.toHaveBeenCalled();
});
test("expiry during wallet preparation stops before dispatch and retains the original claim", async () => {
  const h = fixture(), { controller, review } = await payable(h); h.beforeWallet(() => h.advance(120_000));
  await expect(controller.confirmPayment(review.reviewId)).rejects.toThrow("claim_mismatch");
  expect(h.walletInvocations()).toBe(0); expect(h.journal().read()?.invocations).toEqual([]); expect(h.api.claim).toHaveBeenCalledTimes(1);
});
test("an unknown wallet result remains durable across reload and never signs twice", async () => {
  const h = fixture(), { controller, review } = await payable(h); h.setWallet("unknown");
  await expect(controller.confirmPayment(review.reviewId)).rejects.toThrow("submission_uncertain");
  expect(h.journal().read()?.invocations[0]?.transactionHash).toBeNull();
  const reopened = h.controller(); await reopened.open(); await expect(reopened.preparePayment()).rejects.toThrow("original_submission_pending");
  await expect(reopened.startFresh()).rejects.toThrow("resolution_unproven"); expect(h.walletInvocations()).toBe(1);
});
test.each(["claimed", "finalized"] as const)("remote %s cancellation authority prevents a cached funding grant from dispatching", async cancellationState => {
  const h = fixture(), { controller, review } = await payable(h);
  h.beforeWallet(() => h.setCurrent({ ...h.current(), submissions: [...h.current().submissions, {
    state: cancellationState, purpose: "nonce_cancellation", grant_id: "remote-cancellation-grant", grant_revision: 1,
    holder_client_instance_id: "remote_client_instance_one", submission_attempt_id: "remote_submission_attempt_one",
    valid_until: f.claim.receipt.valid_until, cancellation_preparation_id: f.cancellation.preparation_id, cancellation_preparation_revision: f.cancellation.preparation_revision,
  }] }));
  await expect(controller.confirmPayment(review.reviewId)).rejects.toThrow("submission_unavailable");
  expect(h.current().submissions[0]?.purpose).toBe("funding_transfer");
  expect(h.api.claim).toHaveBeenCalledTimes(1); expect(h.journal().read()?.commands).toHaveLength(2);
  expect(h.journal().read()?.invocations).toEqual([]); expect(h.walletInvocations()).toBe(0);
});
test("prepared but unclaimed cancellation does not consume funding dispatch authority", async () => {
  const h = fixture(), { controller, review } = await payable(h);
  h.beforeWallet(() => h.setCurrent({ ...h.current(), submissions: [...h.current().submissions, {
    state: "unclaimed", purpose: "nonce_cancellation", grant_id: null, grant_revision: 0,
    holder_client_instance_id: null, submission_attempt_id: null, valid_until: null,
    cancellation_preparation_id: f.cancellation.preparation_id, cancellation_preparation_revision: f.cancellation.preparation_revision,
  }] }));
  await controller.confirmPayment(review.reviewId); expect(h.walletInvocations()).toBe(1);
});
test("an uncertain funding invocation may still be followed by one original-nonce cancellation", async () => {
  const h = fixture(), { controller, review } = await payable(h); h.setWallet("unknown");
  await expect(controller.confirmPayment(review.reviewId)).rejects.toThrow("submission_uncertain");
  await controller.prepareCancellation(); h.setWallet("ok"); h.setClock("2026-10-18T14:20:10.000Z");
  const cancellation = await controller.preparePayment(true); if (cancellation.kind !== "pay") throw new Error("fixture_pay_missing");
  await controller.confirmPayment(cancellation.reviewId);
  expect(h.journal().read()?.invocations.map(invocation => invocation.purpose)).toEqual(["funding_transfer", "nonce_cancellation"]);
  expect(h.walletInvocations()).toBe(2); expect(h.api.claim).toHaveBeenCalledTimes(2);
});
test("a lost observation acknowledgement recovers the saved transaction without sending again", async () => {
  const h = fixture(), { controller, review } = await payable(h); h.setObservationLost();
  await expect(controller.confirmPayment(review.reviewId)).rejects.toThrow("observation_response_lost");
  expect(h.journal().read()?.invocations[0]?.transactionHash).toBe(f.observationRequest.transaction_hash);
  expect((await h.controller().open()).kind).toBe("status"); expect(h.api.observe).toHaveBeenCalledTimes(1); expect(h.walletInvocations()).toBe(1);
});
test("account replacement during wallet preparation clears the view and prevents dispatch", async () => {
  const h = fixture(), { controller, review } = await payable(h); h.beforeWallet(() => h.scope(null));
  await expect(controller.confirmPayment(review.reviewId)).rejects.toThrow("scope_changed"); expect(controller.state).toEqual({ kind: "idle" }); expect(h.walletInvocations()).toBe(0);
});
test("recovery queues only original reconciliation and never invokes a wallet", async () => {
  const h = fixture(), controller = await reserved(h); await controller.recoverOriginal();
  expect(h.api.recover).toHaveBeenCalledWith(f.receipt.contribution_id, expect.objectContaining({ purpose: "reconcile_original", expected_state_revision: 0 }), expect.any(AbortSignal)); expect(h.wallet.send).not.toHaveBeenCalled();
});
test("manual observation is journaled against the original contribution and instruction", async () => {
  const h = fixture(), controller = await reserved(h); await controller.observeOriginal(f.observationRequest.transaction_hash);
  expect(h.api.observe).toHaveBeenCalledWith(f.receipt.contribution_id, expect.objectContaining({ instruction_hash: f.receipt.instruction.instruction_hash, transaction_hash: f.observationRequest.transaction_hash }), expect.any(AbortSignal)); expect(h.wallet.send).not.toHaveBeenCalled();
});
test("cancellation requires its own prepared terms, Pay review and fresh purpose-bound grant", async () => {
  const h = fixture(), controller = await reserved(h); await controller.prepareCancellation(); h.setClock("2026-10-18T14:20:10.000Z");
  const review = await controller.preparePayment(true); if (review.kind !== "pay") throw new Error("fixture_pay_missing");
  await controller.confirmPayment(review.reviewId);
  expect(h.wallet.send).toHaveBeenCalledWith(h.current().command_receipt, review.fee, expect.any(Function), f.cancellation);
  expect(h.api.claim).toHaveBeenCalledWith(f.receipt.contribution_id, expect.objectContaining({ purpose: "nonce_cancellation", instruction_hash: f.cancellation.instruction_hash }), expect.any(AbortSignal));
  expect(h.api.observe).toHaveBeenCalledWith(f.receipt.contribution_id, expect.objectContaining({ instruction_hash: f.cancellation.instruction_hash }), expect.any(AbortSignal));
});
test("a superseded cancellation preparation stops before dispatch", async () => {
  const h = fixture(), controller = await reserved(h); await controller.prepareCancellation(); h.setClock("2026-10-18T14:20:10.000Z");
  const review = await controller.preparePayment(true); if (review.kind !== "pay") throw new Error("fixture_pay_missing");
  h.beforeWallet(() => h.setCurrent({ ...h.current(), cancellation: { ...h.current().cancellation, current_preparation_revision: 2 } }));
  await expect(controller.confirmPayment(review.reviewId)).rejects.toThrow("cancellation_mismatch"); expect(h.walletInvocations()).toBe(0);
});
test("a fresh start archives original history only after the server proves a consumed nonce", async () => {
  const h = fixture(), controller = await reserved(h);
  h.setCurrent({ ...h.current(), state: "nonce_closed_no_principal", nonce_state: "consumed_cancellation", disposition: "no_principal", allowed_actions: ["start_fresh_contribution"] });
  expect((await controller.startFresh()).kind).toBe("amount"); expect(h.journal().read()).toBeNull();
  expect([...h.values.keys()].some(key => key.startsWith(`${contributionJournalKey(f.scope)}:history:`))).toBe(true); expect(h.api.create).toHaveBeenCalledTimes(1);
});
test("corrupt pending storage fails closed without a new contribution or wallet", async () => {
  const h = fixture(); h.values.set(contributionJournalKey(f.scope), "{broken");
  await expect(h.controller().open()).rejects.toThrow("journal_corrupt"); expect(h.api.create).not.toHaveBeenCalled(); expect(h.wallet.send).not.toHaveBeenCalled();
});
