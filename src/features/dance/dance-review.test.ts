import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { establishSessionAuthority, forgetSessionAuthority } from "../../api/browser-session-events";
import { createDanceReviewController } from "./dance-review-controller";
import { createDanceReviewFixtureStore, danceReviewFixtureReceipt, danceReviewFixtures as f, danceReviewScope as scope } from "./dance-review.fixtures";
import type { DanceReviewApi, DanceReviewCommand } from "./dance-review-api";
import type { DanceResult, DanceResultScope } from "./dance-result-api";
import { danceReviewJournalKey } from "./dance-review-journal";
import { buildRouteTree, PageFileSystemRouter } from "filesystem-routing";
import { resolve } from "node:path";
beforeEach(establishSessionAuthority);
afterEach(forgetSessionAuthority);

test("the result and recording pages are separate reachable route leaves", async () => {
  const router = new PageFileSystemRouter({ dir: resolve("src/routes"), extensions: ["js", "jsx", "ts", "tsx"] });
  const routes = buildRouteTree(await router.getRoutes()).filter(route => route.path.startsWith("/dance/"));
  expect(routes.map(route => ({ path: route.path, children: route.children }))).toEqual([
    { path: "/dance/:communityId/reviews/:reviewId/", children: undefined },
    { path: "/dance/:communityId/reviews/:reviewId/recording", children: undefined },
  ]);
});

function setup() {
  const { entries, store } = createDanceReviewFixtureStore();
  let result: DanceResult = f.uploaded, selected: DanceResultScope | null = scope;
  const read = vi.fn(async () => result);
  const command = vi.fn(async (_scope: DanceResultScope, body: DanceReviewCommand) => {
    expect(entries.size).toBe(1); // Original is durable before the first effect.
    result = body.operation === "withdraw" ? f.withdrawn : { ...f.awaiting, review_revision: result.review_revision + 1,
      show_publicly_if_passed: body.show_publicly_if_passed,
      initial_submit_receipt: { ...f.awaiting.initial_submit_receipt, show_publicly_if_passed: body.show_publicly_if_passed } };
    return danceReviewFixtureReceipt(body, result);
  });
  const disclosure = vi.fn(async () => "disclosure-v1"), media = vi.fn();
  const api: DanceReviewApi = { read, command, disclosure, media };
  const key = vi.fn(() => "original-command");
  const controller = () => createDanceReviewController({ scope, currentScope: () => selected, store, api, commandKey: key });
  return { entries, store, read, command, disclosure, key, controller, select: (value: DanceResultScope | null) => { selected = value; }, setResult: (value: DanceResult) => { result = value; } };
}
const signal = () => new AbortController().signal;

test("Submit durably captures explicit on, current revision and the frozen disclosure; fresh GET owns the view", async () => {
  const s = setup(), view = await s.controller().act(f.uploaded, { operation: "submit", showPublicly: true }, signal());
  expect(s.command.mock.calls[0]![1]).toEqual({ version: "dance-review-submit-v1", operation: "submit", idempotency_key: "original-command",
    community_id: "community", review_id: "review", expected_review_revision: 1, show_publicly_if_passed: true, publication_disclosure_version: "disclosure-v1" });
  expect(view.result.state).toBe("awaiting_review"); expect(s.read).toHaveBeenCalledTimes(2); expect(s.entries.size).toBe(0);
});

test("lost Submit acknowledgement survives a new controller and replays the identical original before showing current state", async () => {
  const s = setup(), original = s.command.getMockImplementation()!;
  s.command.mockImplementationOnce(async (scope, body) => { await original(scope, body); throw new Error("reply_lost"); });
  await expect(s.controller().act(f.uploaded, { operation: "submit", showPublicly: false }, signal())).rejects.toThrow("reply_lost");
  const retained = [...s.entries.values()][0]; expect(retained).toContain('"bodyJson"');
  const first = s.command.mock.calls[0]![1];
  const receipt = danceReviewFixtureReceipt(first, { ...f.awaiting, review_revision: 2 });
  s.command.mockResolvedValueOnce(receipt); s.setResult(f.passed);
  const recovered = await s.controller().load(signal());
  expect(s.command.mock.calls[1]![1]).toEqual(first); expect(s.key).toHaveBeenCalledTimes(1);
  expect(recovered.result).toEqual(f.passed); expect(s.entries.size).toBe(0);
});

test("a new intent cannot replace an outstanding unknown command", async () => {
  const s = setup(); s.command.mockRejectedValueOnce(new Error("unknown"));
  await expect(s.controller().act(f.uploaded, { operation: "submit", showPublicly: true }, signal())).rejects.toThrow();
  await s.controller().act(f.uploaded, { operation: "withdraw" }, signal());
  expect(s.command.mock.calls.map(([, body]) => body.operation)).toEqual(["submit", "submit"]); expect(s.key).toHaveBeenCalledTimes(1);
});

test("a lost current read after receipt retains the original instead of showing a historical acknowledgement", async () => {
  const s = setup(); s.read.mockResolvedValueOnce(f.uploaded).mockRejectedValueOnce(new Error("read_lost"));
  await expect(s.controller().act(f.uploaded, { operation: "submit", showPublicly: true }, signal())).rejects.toThrow("read_lost");
  expect(s.entries.size).toBe(1); await s.controller().load(signal());
  expect(s.command.mock.calls[1]![1]).toEqual(s.command.mock.calls[0]![1]);
});

test("pending visibility uses the original disclosure and actual false without another consent step", async () => {
  const s = setup(); s.setResult({ ...f.awaiting, show_publicly_if_passed: true });
  await s.controller().act({ ...f.awaiting, show_publicly_if_passed: true }, { operation: "visibility", showPublicly: false }, signal());
  expect(s.disclosure).not.toHaveBeenCalled(); expect(s.command.mock.calls[0]![1]).toMatchObject({ operation: "visibility", expected_review_revision: 3, show_publicly_if_passed: false, publication_disclosure_version: "disclosure-v1" });
});

test("a verdict that beats the visibility command is displayed as final after a durable refusal", async () => {
  const s = setup(); s.setResult(f.awaiting);
  s.command.mockImplementationOnce(async (_scope, body) => { s.setResult(f.passed); return danceReviewFixtureReceipt(body, f.passed, "publication_choice_closed"); });
  const view = await s.controller().act(f.awaiting, { operation: "visibility", showPublicly: true }, signal());
  expect(view.result.state).toBe("reviewed"); expect(view.receipt?.outcome).toBe("refused"); expect(s.entries.size).toBe(0);
});

test.each([f.passed, { ...f.awaiting, review_revision: 4 }])("changed current state refuses a new intent without dispatch or key", async result => {
  const s = setup(); s.setResult(result);
  await expect(s.controller().act(f.awaiting, { operation: "withdraw" }, signal())).rejects.toThrow("changed");
  expect(s.command).not.toHaveBeenCalled(); expect(s.key).not.toHaveBeenCalled(); expect(s.entries.size).toBe(0);
});

test.each([
  [f.uploaded, { operation: "visibility", showPublicly: false }],
  [f.awaiting, { operation: "submit", showPublicly: true }],
  [f.passed, { operation: "withdraw" }],
] as const)("closed or wrong command state cannot dispatch", async (result, intent) => {
  const s = setup(); s.setResult(result);
  await expect(s.controller().act(result, intent, signal())).rejects.toThrow("closed"); expect(s.command).not.toHaveBeenCalled();
});

test("withdrawal uses no publication boolean or disclosure and only server-confirmed state is returned", async () => {
  const s = setup(); s.setResult(f.awaiting);
  const view = await s.controller().act(f.awaiting, { operation: "withdraw" }, signal());
  expect(view.result.state).toBe("withdrawn"); expect(s.command.mock.calls[0]![1]).not.toHaveProperty("show_publicly_if_passed"); expect(s.disclosure).not.toHaveBeenCalled();
});

test("a stale read behind the receipt retains recovery and never clears the original", async () => {
  const s = setup(); s.read.mockResolvedValue(f.uploaded);
  await expect(s.controller().act(f.uploaded, { operation: "submit", showPublicly: true }, signal())).rejects.toThrow("stale_read"); expect(s.entries.size).toBe(1);
});

test.each(["foreign-session", "foreign-terms", "foreign-operation"]) ("a mismatched %s receipt cannot clear the original", async mismatch => {
  const s = setup();
  s.command.mockImplementationOnce(async (_scope, body) => {
    const receipt = danceReviewFixtureReceipt(body, f.awaiting);
    if (mismatch === "foreign-operation") return { ...receipt, operation: "withdraw" };
    if (mismatch === "foreign-session") return { ...receipt, result: { ...f.awaiting, session_id: "foreign" } };
    return { ...receipt, result: { ...f.awaiting, session_terms_hash: "a".repeat(64) } };
  });
  await expect(s.controller().act(f.uploaded, { operation: "submit", showPublicly: true }, signal())).rejects.toThrow(); expect(s.entries.size).toBe(1);
});

test("a revoked scope during the effect stops current reads and retains its original", async () => {
  const s = setup(), original = s.command.getMockImplementation()!;
  s.command.mockImplementationOnce(async (scope, body) => { const receipt = await original(scope, body); s.select(null); return receipt; });
  await expect(s.controller().act(f.uploaded, { operation: "submit", showPublicly: true }, signal())).rejects.toThrow("scope_changed");
  expect(s.read).toHaveBeenCalledTimes(1); expect(s.entries.size).toBe(1);
});

test("another account never reads this review's command journal", async () => {
  const s = setup(); s.command.mockRejectedValueOnce(new Error("unknown"));
  await expect(s.controller().act(f.uploaded, { operation: "submit", showPublicly: true }, signal())).rejects.toThrow();
  expect(danceReviewJournalKey(scope)).not.toBe(danceReviewJournalKey({ ...scope, accountId: "another" }));
  s.select({ ...scope, accountId: "another" }); await expect(s.controller().load(signal())).rejects.toThrow("scope_changed"); expect(s.command).toHaveBeenCalledTimes(1);
});

test("corrupt metadata is refused before any server effect", async () => {
  const s = setup(); s.entries.set(danceReviewJournalKey(scope), '{"version":1,"url":"private"}');
  await expect(s.controller().load(signal())).rejects.toThrow("journal_corrupt"); expect(s.command).not.toHaveBeenCalled(); expect(s.read).not.toHaveBeenCalled();
});

test("serialized simultaneous Submit intents produce one command and one stale-intent refusal", async () => {
  const s = setup(), first = s.controller(), second = s.controller();
  const results = await Promise.allSettled([first.act(f.uploaded, { operation: "submit", showPublicly: true }, signal()), second.act(f.uploaded, { operation: "submit", showPublicly: false }, signal())]);
  expect(results.map(result => result.status)).toEqual(["fulfilled", "rejected"]); expect(s.command).toHaveBeenCalledTimes(1); expect(s.key).toHaveBeenCalledTimes(1);
});

test("unavailable durable storage refuses before command dispatch", async () => {
  const s = setup(); s.store.write = () => {};
  await expect(s.controller().act(f.uploaded, { operation: "submit", showPublicly: true }, signal())).rejects.toThrow("journal_unavailable"); expect(s.command).not.toHaveBeenCalled();
});

test("an applied receipt cannot substitute another publication choice", async () => {
  const s = setup(); s.command.mockImplementationOnce(async (_scope, body) => {
    const receipt = danceReviewFixtureReceipt(body, f.awaiting);
    return { ...receipt, result: { ...receipt.result, show_publicly_if_passed: false } };
  });
  await expect(s.controller().act(f.uploaded, { operation: "submit", showPublicly: true }, signal())).rejects.toThrow("receipt_mismatch"); expect(s.entries.size).toBe(1);
});

test("a receipt older than the original command revision cannot clear recovery", async () => {
  const s = setup(); s.setResult(f.awaiting);
  s.command.mockImplementationOnce(async (_scope, body) => ({ ...danceReviewFixtureReceipt(body, f.withdrawn), result: { ...f.withdrawn, review_revision: 2 } }));
  await expect(s.controller().act(f.awaiting, { operation: "withdraw" }, signal())).rejects.toThrow("receipt_mismatch"); expect(s.entries.size).toBe(1);
});
