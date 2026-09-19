import { ApiClientError } from "@pirate/api-client";

import type { StudyLearnerBand, StudySession, StudyV2Api } from "./study-v2-api.ts";

/**
 * Coordinates Study session starts across tabs and reloads for one complete
 * request scope. The persisted key is bound to the account, persona, community,
 * post and practice inputs; a new recording may not silently adopt an
 * independent random key when coordination is unavailable, so the coordinator
 * fails visibly instead.
 */
export interface StudySessionStartScope {
  readonly accountId: string;
  readonly personaId: string;
  readonly communityId: string;
  readonly postId: string;
  readonly targetLanguage: string | null;
  readonly learnerBand: StudyLearnerBand | null;
}

export type StudySessionStartResult =
  | { readonly status: "started"; readonly sessionId: string }
  | { readonly status: "unavailable"; readonly message: string };

export interface StudySessionStartStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type StoredRecord = Readonly<{ key: string; sessionId: string | null }>;

const STORAGE_PREFIX = "study-session-start:v1:";

export function studySessionStartScopeKey(scope: StudySessionStartScope): string {
  return `${STORAGE_PREFIX}${[
    scope.accountId,
    scope.personaId,
    scope.communityId,
    scope.postId,
    scope.targetLanguage ?? "",
    scope.learnerBand ?? "",
  ].join("\u0000")}`;
}

const unavailable = (message: string): StudySessionStartResult => ({
  status: "unavailable",
  message,
});

function readRecord(storage: StudySessionStartStorage, key: string): StoredRecord | null {
  const raw = storage.getItem(key);
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A corrupt record cannot be trusted; treat the scope as unstarted.
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  if (!("key" in parsed) || typeof parsed.key !== "string") return null;
  const sessionId = "sessionId" in parsed ? parsed.sessionId : null;
  return {
    key: parsed.key,
    sessionId: typeof sessionId === "string" && sessionId !== "" ? sessionId : null,
  };
}

function isTerminal(session: StudySession): boolean {
  return session.status !== "active";
}

export interface StudySessionStartCoordinator {
  start(scope: StudySessionStartScope): Promise<StudySessionStartResult>;
  /** Explicit new-lesson action: the next start rotates to a fresh key. */
  forget(scope: StudySessionStartScope): void;
}

export interface StudySessionStartLock {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

export function createStudySessionStartCoordinator(deps: {
  readonly api: Pick<StudyV2Api, "createSession" | "getSession">;
  /** `null` marks storage as unavailable and fails the start visibly. */
  readonly storage?: StudySessionStartStorage | null;
  /** `null` marks browser locks as unavailable and fails the start visibly. */
  readonly locks?: StudySessionStartLock | null;
  readonly generateKey?: (scope: StudySessionStartScope) => string;
  readonly timezone?: () => string;
  readonly maxUncertainAttempts?: number;
}): StudySessionStartCoordinator {
  const storage =
    deps.storage === undefined
      ? typeof window === "undefined"
        ? null
        : window.localStorage
      : deps.storage;
  const locks: StudySessionStartLock | null =
    deps.locks === undefined
      ? typeof navigator === "undefined" || navigator.locks === undefined
        ? null
        : {
            // SAFETY: the DOM LockManager resolves the callback's own value, so
            // the wrapper can expose it as the callback's generic result type.
            request: <T>(name: string, callback: () => Promise<T>): Promise<T> =>
              navigator.locks.request(name, { mode: "exclusive" }, callback) as Promise<T>,
          }
      : deps.locks;
  const maxAttempts = deps.maxUncertainAttempts ?? 3;

  const generateKey = (scope: StudySessionStartScope): string =>
    deps.generateKey?.(scope) ??
    `study-session:${scope.postId}:${
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(36).slice(2)}`
    }`;

  const timezone = (): string => {
    if (deps.timezone) return deps.timezone();
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  };

  const start = async (scope: StudySessionStartScope): Promise<StudySessionStartResult> => {
    if (storage === null) {
      return unavailable(
        "Study cannot coordinate this session because browser storage is unavailable. Enable site storage and retry.",
      );
    }
    if (locks === null) {
      return unavailable(
        "Study cannot coordinate this session because the browser lock API is unavailable. Use a current browser and retry.",
      );
    }
    const recordKey = studySessionStartScopeKey(scope);
    const lockName = `study-session-start:${recordKey}`;
    try {
      return await locks.request(lockName, async () => {
        let record = readRecord(storage, recordKey);
        if (record !== null && record.sessionId !== null) {
          let existing: StudySession | "missing";
          try {
            existing = await deps.api.getSession({
              communityId: scope.communityId,
              sessionId: record.sessionId,
            });
          } catch (error) {
            if (error instanceof ApiClientError && error.status === 404) {
              existing = "missing";
            } else {
              // Unknown outcome: keep the record and key intact for retry.
              return unavailable(
                "Study could not confirm your existing session. Check your connection and retry; your place is preserved.",
              );
            }
          }
          if (existing === "missing") {
            storage.removeItem(recordKey);
            record = null;
          } else if (isTerminal(existing)) {
            // Authoritative terminal evidence permits rotation on entry.
            storage.removeItem(recordKey);
            record = null;
          } else {
            return { status: "started", sessionId: existing.session_id };
          }
        }
        if (record === null) {
          record = { key: generateKey(scope), sessionId: null };
          // Persist before the request so a lost response stays reconcilable.
          storage.setItem(recordKey, JSON.stringify(record));
        }
        const key = record.key;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          try {
            const session = await deps.api.createSession({
              communityId: scope.communityId,
              idempotencyKey: key,
              learnerBand: scope.learnerBand,
              personaId: scope.personaId,
              postId: scope.postId,
              targetLanguage: scope.targetLanguage,
              timezone: timezone(),
            });
            storage.setItem(
              recordKey,
              JSON.stringify({ key, sessionId: session.session_id } satisfies StoredRecord),
            );
            return { status: "started", sessionId: session.session_id };
          } catch (error) {
            if (error instanceof ApiClientError && error.status === 409) {
              return unavailable(
                "Study could not start this session because its request changed. Refresh the page and retry.",
              );
            }
            // Uncertain outcome: retry the identical request with the same key.
            if (attempt === maxAttempts - 1) {
              return unavailable(
                "Study could not confirm this session's start. Retry once the connection is stable; the same session will be reused.",
              );
            }
          }
        }
        return unavailable("Study could not start this session.");
      });
    } catch {
      return unavailable(
        "Study could not coordinate this session with your other tabs. Close other Study tabs and retry.",
      );
    }
  };

  const forget = (scope: StudySessionStartScope): void => {
    storage?.removeItem(studySessionStartScopeKey(scope));
  };

  return { start, forget };
}
