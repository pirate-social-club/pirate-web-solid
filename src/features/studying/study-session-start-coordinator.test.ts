import { describe, expect, it } from "vitest";
import { ApiClientError } from "@pirate/api-client";

import {
  createStudySessionStartCoordinator,
  studySessionStartScopeKey,
  type StudySessionStartLock,
  type StudySessionStartScope,
  type StudySessionStartStorage,
} from "./study-session-start-coordinator.ts";
import type { StudySession, StudyV2Api } from "./study-v2-api.ts";

const scope = (overrides: Partial<StudySessionStartScope> = {}): StudySessionStartScope => ({
  accountId: "account-1",
  personaId: "persona-1",
  communityId: "community-1",
  postId: "post-1",
  targetLanguage: null,
  learnerBand: null,
  ...overrides,
});

const session = (sessionId: string, status: "active" | "completed"): StudySession =>
  // SAFETY: the coordinator reads only session_id and status from the API
  // result; the generated response type is complete at the call boundary.
  ({ session_id: sessionId, status }) as StudySession;

const conflict = (): ApiClientError =>
  new ApiClientError(
    { code: "conflict", name: "Conflict", retryable: false, status: 409 },
    { error: { code: "idempotency-conflict", message: "conflict", retryable: false } },
  );

const missing = (): ApiClientError =>
  new ApiClientError(
    { code: "not_found", name: "NotFound", retryable: false, status: 404 },
    { error: { code: "not-found", message: "missing", retryable: false } },
  );

class MemoryStorage implements StudySessionStartStorage {
  readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

class ThrowingStorage extends MemoryStorage {
  override getItem(): string | null {
    throw new Error("storage blocked");
  }
}

/** Per-name promise chain standing in for the shared origin LockManager. */
function exclusiveLocks(): StudySessionStartLock {
  const chains = new Map<string, Promise<void>>();
  return {
    request: async <T>(name: string, callback: () => Promise<T>): Promise<T> => {
      const previous = chains.get(name) ?? Promise.resolve();
      let release = (): void => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      chains.set(
        name,
        previous.then(() => gate),
      );
      await previous;
      try {
        return await callback();
      } finally {
        release();
      }
    },
  };
}

class FakeApi implements Pick<StudyV2Api, "createSession" | "getSession"> {
  readonly attempts: { key: string; personaId: string; timezone: string }[] = [];
  readonly byKey = new Map<string, StudySession>();
  readonly byId = new Map<string, StudySession>();
  failWith: "network" | "conflict" | null = null;
  commitBeforeNetworkFailure = false;

  createSession = async (input: {
    readonly communityId: string;
    readonly idempotencyKey: string;
    readonly learnerBand: string | null;
    readonly personaId: string;
    readonly postId: string;
    readonly targetLanguage: string | null;
    readonly timezone: string;
  }): Promise<StudySession> => {
    this.attempts.push({
      key: input.idempotencyKey,
      personaId: input.personaId,
      timezone: input.timezone,
    });
    const failure = this.failWith;
    this.failWith = null;
    if (failure === "conflict") throw conflict();
    if (failure === "network") {
      if (this.commitBeforeNetworkFailure) {
        const committed =
          this.byKey.get(input.idempotencyKey) ?? session(`session-${this.byKey.size + 1}`, "active");
        this.byKey.set(input.idempotencyKey, committed);
        this.byId.set(committed.session_id, committed);
      }
      throw new Error("network down");
    }
    const replay = this.byKey.get(input.idempotencyKey);
    if (replay !== undefined) return replay;
    const created = session(`session-${this.byKey.size + 1}`, "active");
    this.byKey.set(input.idempotencyKey, created);
    this.byId.set(created.session_id, created);
    return created;
  };

  getSession = async (input: {
    readonly communityId: string;
    readonly sessionId: string;
  }): Promise<StudySession> => {
    const found = this.byId.get(input.sessionId);
    if (found === undefined) throw missing();
    return found;
  };
}

const coordinatorFor = (api: FakeApi, storage: StudySessionStartStorage) =>
  createStudySessionStartCoordinator({
    api,
    storage,
    locks: exclusiveLocks(),
    generateKey: () => `generated-${Math.random().toString(36).slice(2)}`,
    timezone: () => "UTC",
  });

describe("Study session start coordinator", () => {
  it("shares one key and one session for simultaneous first entry in two tabs", async () => {
    const api = new FakeApi();
    const storage = new MemoryStorage();
    const locks = exclusiveLocks();
    const one = createStudySessionStartCoordinator({
      api,
      storage,
      locks,
      generateKey: () => "generated-first",
      timezone: () => "UTC",
    });
    const two = createStudySessionStartCoordinator({
      api,
      storage,
      locks,
      generateKey: () => "generated-second",
      timezone: () => "UTC",
    });
    const [first, second] = await Promise.all([one.start(scope()), two.start(scope())]);
    expect(first).toEqual({ status: "started", sessionId: "session-1" });
    expect(second).toEqual({ status: "started", sessionId: "session-1" });
    expect(api.attempts.map((attempt) => attempt.key)).toEqual(["generated-first"]);
    expect(api.byKey.size).toBe(1);
  });

  it("reuses the same key for an uncertain response instead of rotating", async () => {
    const api = new FakeApi();
    api.failWith = "network";
    api.commitBeforeNetworkFailure = true;
    const storage = new MemoryStorage();
    const coordinator = coordinatorFor(api, storage);
    const result = await coordinator.start(scope());
    expect(result.status).toBe("started");
    expect(api.attempts).toHaveLength(2);
    expect(api.attempts[0]!.key).toBe(api.attempts[1]!.key);
    expect(api.attempts[0]!.timezone).toBe(api.attempts[1]!.timezone);
    expect(api.byKey.size).toBe(1);
    expect(result).toEqual({ status: "started", sessionId: "session-1" });
  });

  it("reuses the persisted timezone for every retry instead of recomputing it", async () => {
    const api = new FakeApi();
    api.failWith = "network";
    api.commitBeforeNetworkFailure = true;
    const storage = new MemoryStorage();
    let resolutions = 0;
    const coordinator = createStudySessionStartCoordinator({
      api,
      storage,
      locks: exclusiveLocks(),
      generateKey: () => "generated-zone",
      timezone: () => (resolutions++ === 0 ? "Europe/Paris" : "America/New_York"),
    });
    const result = await coordinator.start(scope());
    expect(result.status).toBe("started");
    expect(api.attempts.map((attempt) => attempt.timezone)).toEqual([
      "Europe/Paris",
      "Europe/Paris",
    ]);
    expect(resolutions).toBe(1);
    const stored = JSON.parse(storage.getItem(studySessionStartScopeKey(scope())) ?? "{}");
    expect(stored.timezone).toBe("Europe/Paris");
  });

  it("preserves the key of a legacy record without a timezone instead of rotating", async () => {
    const api = new FakeApi();
    const storage = new MemoryStorage();
    storage.setItem(
      studySessionStartScopeKey(scope()),
      JSON.stringify({ key: "legacy-key", sessionId: null }),
    );
    const coordinator = coordinatorFor(api, storage);
    const result = await coordinator.start(scope());
    expect(result.status).toBe("started");
    expect(api.attempts).toHaveLength(1);
    // The prior start under this key may already have committed, so the key is
    // preserved and only the missing timezone is reconciled.
    expect(api.attempts[0]!.key).toBe("legacy-key");
    const stored = JSON.parse(storage.getItem(studySessionStartScopeKey(scope())) ?? "{}");
    expect(stored.key).toBe("legacy-key");
    expect(stored.timezone).toBe("UTC");
  });

  it("resumes a stored active session without starting another", async () => {
    const api = new FakeApi();
    const storage = new MemoryStorage();
    const active = session("session-active", "active");
    api.byId.set(active.session_id, active);
    storage.setItem(
      studySessionStartScopeKey(scope()),
      JSON.stringify({ key: "stored-key", sessionId: active.session_id, timezone: "UTC" }),
    );
    const coordinator = coordinatorFor(api, storage);
    const result = await coordinator.start(scope());
    expect(result).toEqual({ status: "started", sessionId: "session-active" });
    expect(api.attempts).toHaveLength(0);
  });

  it("rotates only on authoritative terminal evidence", async () => {
    const api = new FakeApi();
    const storage = new MemoryStorage();
    const completed = session("session-done", "completed");
    api.byId.set(completed.session_id, completed);
    storage.setItem(
      studySessionStartScopeKey(scope()),
      JSON.stringify({ key: "stored-key", sessionId: completed.session_id, timezone: "UTC" }),
    );
    const coordinator = coordinatorFor(api, storage);
    const result = await coordinator.start(scope());
    expect(result.status).toBe("started");
    expect(api.attempts).toHaveLength(1);
    expect(api.attempts[0]!.key).not.toBe("stored-key");
  });

  it("rotates on an explicit new-lesson action", async () => {
    const api = new FakeApi();
    const storage = new MemoryStorage();
    const coordinator = coordinatorFor(api, storage);
    await coordinator.start(scope());
    const firstKey = api.attempts[0]!.key;
    coordinator.forget(scope());
    const second = await coordinator.start(scope());
    expect(second.status).toBe("started");
    expect(api.attempts).toHaveLength(2);
    expect(api.attempts[1]!.key).not.toBe(firstKey);
  });

  it("binds the stored key to the persona and complete request", async () => {
    const api = new FakeApi();
    const storage = new MemoryStorage();
    const coordinator = coordinatorFor(api, storage);
    await coordinator.start(scope());
    await coordinator.start(scope({ personaId: "persona-2" }));
    await coordinator.start(scope({ targetLanguage: "es", learnerBand: "A1" }));
    expect(api.attempts).toHaveLength(3);
    expect(new Set(api.attempts.map((attempt) => attempt.key)).size).toBe(3);
  });

  it("fails visibly when browser storage is unavailable", async () => {
    const api = new FakeApi();
    const coordinator = createStudySessionStartCoordinator({
      api,
      storage: new ThrowingStorage(),
      locks: exclusiveLocks(),
      timezone: () => "UTC",
    });
    const result = await coordinator.start(scope());
    expect(result.status).toBe("unavailable");
    expect(api.attempts).toHaveLength(0);
  });

  it("fails visibly when browser coordination is unavailable", async () => {
    const api = new FakeApi();
    const coordinator = createStudySessionStartCoordinator({
      api,
      storage: new MemoryStorage(),
      locks: null,
      timezone: () => "UTC",
    });
    const result = await coordinator.start(scope());
    expect(result.status).toBe("unavailable");
    expect(api.attempts).toHaveLength(0);
  });

  it("fails visibly on a definite conflict without rotating the key", async () => {
    const api = new FakeApi();
    api.failWith = "conflict";
    const storage = new MemoryStorage();
    const coordinator = coordinatorFor(api, storage);
    const result = await coordinator.start(scope());
    expect(result.status).toBe("unavailable");
    expect(api.attempts).toHaveLength(1);
    const stored = storage.getItem(studySessionStartScopeKey(scope()));
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored ?? "{}")).toMatchObject({ key: api.attempts[0]!.key, sessionId: null });
  });
});
