import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { establishSessionAuthority, forgetSessionAuthority, replaceSessionAuthority } from "../../api/browser-session-events";
import type { DanceJournalStore } from "./dance-preparation-journal";
import type { DanceReferenceApi } from "./dance-reference-api";
import { createDanceReferenceController, danceReferenceJournalKey, type DanceReferenceLocator } from "./dance-reference-controller";
import { danceReferenceCommand, danceReferenceStatus, danceReferenceTarget as target } from "./dance-reference.fixtures";

const scope = target.scope, locator = { accountId: scope.accountId, referencePostId: scope.referencePostId };
const signal = () => new AbortController().signal;
function harness() {
  const entries = new Map<string, string>(); let tail: Promise<unknown> = Promise.resolve(), selected: DanceReferenceLocator | null = locator;
  let writes = 0, failAt = -1, sequence = 0;
  const store: DanceJournalStore = {
    read: key => entries.get(key) ?? null,
    write: (key, raw) => { if (++writes === failAt) throw new Error("write_failed"); entries.set(key, raw); },
    remove: key => { entries.delete(key); },
    exclusive<T>(_key: string, use: () => Promise<T>): Promise<T> { const next = tail.then(use); tail = next.catch(() => {}); return next; },
  };
  const api = {
    target: vi.fn<DanceReferenceApi["target"]>(async () => target),
    create: vi.fn<DanceReferenceApi["create"]>(async () => ({ ...danceReferenceStatus, status: "pending" })),
    status: vi.fn<DanceReferenceApi["status"]>(async () => danceReferenceStatus),
  };
  const controller = () => createDanceReferenceController({ locator, currentLocator: () => selected, api, store, commandKey: () => `reference-key-${++sequence}` });
  return { entries, store, api, controller, key: danceReferenceJournalKey(locator), failWrite: (n: number) => { failAt = n; }, select: (v: DanceReferenceLocator | null) => { selected = v; } };
}
beforeEach(establishSessionAuthority);
afterEach(() => { forgetSessionAuthority(); vi.restoreAllMocks(); });

test("draft load is read-only; an explicit creation is durably saved before POST and followed by a fresh GET", async () => {
  const h = harness(), c = h.controller(); expect(await c.load(signal())).toEqual({ kind: "draft", target }); expect(h.api.create).not.toHaveBeenCalled();
  h.api.create.mockImplementationOnce(async (selected, body) => {
    const entry = JSON.parse(h.entries.get(h.key)!); expect(entry.bodyJson).toBe(JSON.stringify(body)); expect(entry.choreographyId).toBeNull();
    expect(selected).toEqual(scope); return { ...danceReferenceStatus, status: "pending" };
  });
  expect(await c.create(target, "song-persona", signal())).toEqual({ kind: "status", scope, personaId: "song-persona", reference: danceReferenceStatus });
  expect(h.api.status).toHaveBeenCalledWith(scope, "choreography", expect.any(AbortSignal));
  expect(JSON.parse(h.entries.get(h.key)!).choreographyId).toBe("choreography");
});
test("a lost Create reply survives reload without POST; explicit recovery replays the exact original key, profile and song", async () => {
  const h = harness(); h.api.create.mockRejectedValueOnce(new Error("accepted_but_reply_lost"));
  await expect(h.controller().create(target, "song-persona", signal())).rejects.toThrow("reply_lost");
  const original = h.entries.get(h.key); expect(original).toBeDefined();
  h.api.target.mockRejectedValue(new Error("video_now_hidden"));
  const restarted = h.controller(); expect(await restarted.load(signal())).toEqual({ kind: "needs_check", scope, personaId: "song-persona" });
  expect(h.api.create).toHaveBeenCalledTimes(1); expect(h.api.target).toHaveBeenCalledTimes(1);
  await restarted.retry(signal()); expect(h.api.create).toHaveBeenCalledTimes(2);
  expect(h.api.create.mock.calls[0]![1]).toEqual(h.api.create.mock.calls[1]![1]);
});
test("a second click or another tab cannot create another purpose or change the selected profile", async () => {
  const h = harness(); await Promise.all([h.controller().create(target, "song-persona", signal()), h.controller().create(target, "other-persona", signal())]);
  expect(h.api.create).toHaveBeenCalledOnce(); expect(h.api.create.mock.calls[0]![1].persona_id).toBe("song-persona");
});
test("an unknown original cannot be replaced by calling Create with another profile", async () => {
  const h = harness(); h.api.create.mockRejectedValueOnce(new Error("unknown")); await expect(h.controller().create(target, "song-persona", signal())).rejects.toThrow();
  const raw = h.entries.get(h.key); expect((await h.controller().create(target, "replacement-profile", signal())).kind).toBe("needs_check");
  expect(h.api.create).toHaveBeenCalledOnce(); expect(h.entries.get(h.key)).toBe(raw);
});
test("failure to persist the original command prevents any POST", async () => {
  const h = harness(); h.failWrite(1); await expect(h.controller().create(target, "song-persona", signal())).rejects.toThrow("write_failed");
  expect(h.api.create).not.toHaveBeenCalled(); expect(h.entries.has(h.key)).toBe(false);
});
test("failure to save the returned choreography retains the original command for exact recovery", async () => {
  const h = harness(); h.failWrite(2); await expect(h.controller().create(target, "song-persona", signal())).rejects.toThrow("write_failed");
  expect((await h.controller().load(signal())).kind).toBe("needs_check"); expect(h.api.create).toHaveBeenCalledOnce();
  await h.controller().retry(signal()); expect(h.api.create.mock.calls[0]![1]).toEqual(h.api.create.mock.calls[1]![1]);
});
test("a failed current-status GET retains the known identity; reload uses only GET", async () => {
  const h = harness(); h.api.status.mockRejectedValueOnce(new Error("offline")); await expect(h.controller().create(target, "song-persona", signal())).rejects.toThrow("offline");
  const raw = h.entries.get(h.key); await h.controller().load(signal()); expect(h.api.create).toHaveBeenCalledOnce(); expect(h.entries.get(h.key)).toBe(raw);
});
test("a foreign current choreography cannot replace the saved one", async () => {
  const h = harness(); await h.controller().create(target, "song-persona", signal()); const raw = h.entries.get(h.key);
  h.api.status.mockResolvedValueOnce({ ...danceReferenceStatus, choreography_id: "another-choreography" });
  await expect(h.controller().load(signal())).rejects.toThrow("response_changed"); expect(h.entries.get(h.key)).toBe(raw);
});
test("fresh target drift or unplayable delivery prevents journal allocation and creation", async () => {
  for (const changed of [{ ...target, scope: { ...scope, communityId: "another-community" } }, { ...target, playable: false }]) {
    const h = harness(); h.api.target.mockResolvedValueOnce(changed); await expect(h.controller().create(target, "song-persona", signal())).rejects.toThrow("target_changed");
    expect(h.entries.size).toBe(0); expect(h.api.create).not.toHaveBeenCalled();
  }
});
test("a corrupted, foreign or extra-field journal is retained and causes no network effect", async () => {
  for (const body of [{ ...danceReferenceCommand, song_post_id: "foreign" }, { ...danceReferenceCommand, unexpected: "field" }]) {
    const h = harness(); const raw = JSON.stringify({ ...scope, version: 1, bodyJson: JSON.stringify(body), choreographyId: null }); h.entries.set(h.key, raw);
    await expect(h.controller().load(signal())).rejects.toThrow("journal_corrupt"); expect(h.entries.get(h.key)).toBe(raw);
    expect(h.api.target).not.toHaveBeenCalled(); expect(h.api.create).not.toHaveBeenCalled();
  }
});
test("changing account, route or session epoch fences a queued original before dispatch", async () => {
  const h = harness(), c = h.controller(); h.select({ ...locator, accountId: "replacement-account" });
  await expect(c.create(target, "song-persona", signal())).rejects.toThrow("scope_changed"); expect(h.api.target).not.toHaveBeenCalled();
  h.select(locator); replaceSessionAuthority(); await expect(c.load(signal())).rejects.toThrow("scope_changed"); expect(h.entries.size).toBe(0);
});
test("a late accepted receipt after navigation leaves the original recoverable", async () => {
  const h = harness(); let finish!: (value: typeof danceReferenceStatus) => void;
  h.api.create.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })); const pending = h.controller().create(target, "song-persona", signal());
  await vi.waitFor(() => expect(h.api.create).toHaveBeenCalledOnce()); h.select(null); finish(danceReferenceStatus);
  await expect(pending).rejects.toThrow("scope_changed"); expect(JSON.parse(h.entries.get(h.key)!).choreographyId).toBeNull();
});
test("an explicit confirmed-failure recovery saves a distinct key and concurrent stale clicks cannot allocate another", async () => {
  const h = harness();
  h.api.status.mockImplementation(async (_scope, id) => ({ ...danceReferenceStatus, choreography_id: id, status: id === "choreography" ? "failed" : "pending" }));
  const c = h.controller(); await c.create(target, "song-persona", signal());
  const original = h.api.create.mock.calls[0]![1];
  h.api.create.mockResolvedValueOnce({ ...danceReferenceStatus, choreography_id: "recovered", status: "pending" });
  const views = await Promise.all([c.prepareAgain("choreography", signal()), h.controller().prepareAgain("choreography", signal())]);
  expect(h.api.create).toHaveBeenCalledTimes(2);
  const next = h.api.create.mock.calls[1]![1]; expect(next.idempotency_key).not.toBe(original.idempotency_key);
  expect(next).toEqual({ ...original, idempotency_key: next.idempotency_key });
  expect(views.every(v => v.kind === "status" && v.reference.choreography_id === "recovered")).toBe(true);
  await h.controller().load(signal()); expect(h.api.create).toHaveBeenCalledTimes(2);
});
test("an uncertain preparation retry survives reload and resends only its new original key", async () => {
  const h = harness(); h.api.status.mockResolvedValue({ ...danceReferenceStatus, status: "failed" });
  await h.controller().create(target, "song-persona", signal());
  h.api.create.mockRejectedValueOnce(new Error("new_reply_lost"));
  await expect(h.controller().prepareAgain("choreography", signal())).rejects.toThrow("new_reply_lost");
  const original = h.api.create.mock.calls[1]![1];
  expect((await h.controller().load(signal())).kind).toBe("needs_check");
  expect((await h.controller().prepareAgain("choreography", signal())).kind).toBe("needs_check");
  expect(h.api.create).toHaveBeenCalledTimes(2);
  await h.controller().retry(signal()); expect(h.api.create.mock.calls[2]![1]).toEqual(original);
});
test("fresh status, target and delivery fences preserve the journal before a new preparation", async () => {
  for (const status of ["pending", "normalizing", "ready"] as const) {
    const h = harness(); await h.controller().create(target, "song-persona", signal()); const original = h.entries.get(h.key);
    h.api.status.mockResolvedValue({ ...danceReferenceStatus, status }); await h.controller().prepareAgain("choreography", signal());
    expect(h.api.create).toHaveBeenCalledOnce(); expect(h.entries.get(h.key)).toBe(original);
  }
  for (const changed of [{ ...target, scope: { ...scope, postId: "changed-song" } }, { ...target, playable: false }]) {
    const h = harness(); await h.controller().create(target, "song-persona", signal()); const original = h.entries.get(h.key);
    h.api.status.mockResolvedValue({ ...danceReferenceStatus, status: "failed" }); h.api.target.mockResolvedValue(changed);
    await expect(h.controller().prepareAgain("choreography", signal())).rejects.toThrow("target_changed");
    expect(h.api.create).toHaveBeenCalledOnce(); expect(h.entries.get(h.key)).toBe(original);
  }
});
