import { expect, type BrowserContext, type Page, type Route } from "playwright/test";
import { authority, credentialId, csrf, firstAnswer, initialSession, ownerId, prepared, proof, proofCookie } from "./data.ts";

export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => { resolve = yes; });
  return { promise, resolve };
}
/** Read-only native inspection. Missing stores fail; the inspector never initializes inventory. */
export function nativeRead(page: Page, database: string, store: string, key: string): Promise<unknown> {
  return page.evaluate(({ database, store, key }) => new Promise<unknown>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => { settled = true; reject(new Error("Native inspection deadline")); }, 2_000);
    const fail = () => { if (!settled) { settled = true; clearTimeout(timer); reject(new Error("Native inventory unavailable")); } };
    const request = indexedDB.open(database);
    request.onupgradeneeded = () => { request.transaction?.abort(); fail(); };
    request.onerror = fail;
    request.onsuccess = () => {
      const db = request.result;
      if (settled) { db.close(); return; }
      let tx: IDBTransaction;
      try { tx = db.transaction(store, "readonly"); } catch { db.close(); fail(); return; }
      let result: unknown;
      const read = tx.objectStore(store).get(key);
      read.onsuccess = () => { result = read.result; };
      read.onerror = () => { db.close(); fail(); };
      tx.onabort = tx.onerror = () => { db.close(); fail(); };
      tx.oncomplete = () => { db.close(); if (!settled) { settled = true; clearTimeout(timer); resolve(result); } };
    };
  }), { database, store, key });
}
export const authorityRead = (page: Page, origin: string) => nativeRead(page, "pirate.guest-authority.v1", "journal", origin);
export const answerRead = (page: Page, origin: string) => nativeRead(page, "pirate.guest-study-answers.v1", "sessionInventory",
  JSON.stringify([origin, ownerId, "community-1", "session-1"]));

/** Only API/provider-boundary scripting. Browser products/native state are never replaced. */
export async function installApi(context: BrowserContext, origin: string, options: {
  account: "pending" | "failed"; answer?: "unknown" | "accepted"; holdStart?: boolean;
}) {
  const initial = initialSession();
  let current = initial, confirmed = false, startKey: string | undefined;
  let disposed = false;
  const startEntered = deferred(), releaseStart = deferred(), releaseAccount = deferred(), answerEntered = deferred();
  const counts = { prepared: 0, account: 0, issue: 0, confirm: 0, start: 0, lookup: 0, answer: 0, namedProof: 0 };
  const originalRequests: unknown[] = [], answerKeys: string[] = [];
  const namedOrigin = origin.replace("127.0.0.1", "localhost");
  const fulfill = (route: Route, body: unknown, status = 200, headers: Record<string, string> = {}) => route.fulfill({
    status, contentType: "application/json", headers: { "cache-control": "no-store", ...headers }, body: JSON.stringify(body),
  });
  const handler = async (route: Route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin && url.origin !== namedOrigin) return route.abort("blockedbyclient");
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const path = url.pathname.slice(4), headers = await request.allHeaders();
    // Ordinary session resolution begins its independent persona read too.
    if (path === "/personas") return fulfill(route, { error: { code: "internal_error",
      message: "Scripted ordinary persona read failure", retryable: false } }, 500);
    if (path === "/users/me") {
      counts.account++;
      if (options.account === "pending") await releaseAccount.promise;
      return fulfill(route, { error: { code: "internal_error", message: "Scripted ordinary account read failure", retryable: false } }, 500);
    }
    if (path === "/communities/community-1/posts/post-1/study/public") {
      counts.prepared++;
      expect(headers.cookie).toBeUndefined(); expect(headers.authorization).toBeUndefined();
      return fulfill(route, prepared());
    }
    if (path === "/guest/authority") {
      if (url.origin === namedOrigin) {
        expect(headers.cookie?.includes(proofCookie) ?? false).toBe(false);
        counts.namedProof++;
        return fulfill(route, authority("absent"));
      }
      return fulfill(route, authority(confirmed ? "confirmed" : "absent"), 200,
        { "set-cookie": `__Host-pirate_guest_csrf=${csrf}; Path=/; Secure; SameSite=Lax` });
    }
    if (request.method() !== "GET") {
      expect(headers.origin).toBe(origin);
      expect(headers["x-guest-csrf-token"]).toBe(csrf);
      expect(headers.authorization).toBeUndefined();
    }
    if (path === "/guest/bootstrap") {
      counts.issue++;
      const body: unknown = request.postDataJSON();
      expect(body).toEqual({ idempotency_key: expect.any(String) });
      return fulfill(route, authority("pending"), 200,
        { "set-cookie": `${proofCookie}=${proof}; Path=/; Secure; HttpOnly; SameSite=Lax` });
    }
    if (path === "/guest/bootstrap/confirm") {
      counts.confirm++;
      expect(headers.cookie).toContain(`${proofCookie}=${proof}`);
      expect(request.postDataJSON()).toEqual({ expected_owner_id: ownerId, credential_id: credentialId });
      confirmed = true;
      return fulfill(route, authority("confirmed"));
    }
    expect(headers["x-guest-credential-id"]).toBe(credentialId);
    expect(headers.cookie).toContain(`${proofCookie}=${proof}`);
    if (path === "/communities/community-1/posts/post-1/study/guest/v1/sessions") {
      counts.start++;
      const body: unknown = request.postDataJSON();
      if (typeof body !== "object" || body === null || !("idempotency_key" in body) || typeof body.idempotency_key !== "string")
        throw new Error("Original start identity missing");
      startKey = body.idempotency_key;
      originalRequests.push(body);
      expect(body).toMatchObject({ expected_owner_id: ownerId, target_language: "ar", learner_band: "A1",
        reward_mode: "practice_only", reward_preview_terms_hash: null, disclosure: { version: prepared().disclosure.version, accepted: true } });
      const saved = await authorityRead(request.frame().page(), origin);
      expect(saved).toMatchObject({ pointer: { origin, owner_id: ownerId, credential_id: credentialId, last_start_key: startKey },
        starts: [{ body, state: "submitted" }] });
      startEntered.resolve();
      if (options.holdStart) await releaseStart.promise;
      return fulfill(route, initial, 201);
    }
    if (path.startsWith("/communities/community-1/posts/post-1/study/guest/v1/session-operations/")) {
      counts.lookup++;
      expect(decodeURIComponent(path.split("/").at(-1) ?? "")).toBe(startKey);
      return fulfill(route, { state: "completed", session: current });
    }
    if (path === "/communities/community-1/study/guest/v1/sessions/session-1") return fulfill(route, current);
    if (path === "/communities/community-1/study/guest/v1/sessions/session-1/items/item-1/answers") {
      counts.answer++;
      const key = headers["idempotency-key"];
      if (key === undefined) throw new Error("Original answer key missing");
      answerKeys.push(key);
      expect(request.postDataJSON()).toEqual({ kind: "single_select", choice_key: "one" });
      expect(headers["x-study-attempt-number"]).toBe("1");
      const pending = await answerRead(request.frame().page(), origin);
      expect(pending).toEqual({ scope: { origin, ownerId, communityId: "community-1", sessionId: "session-1" }, pending: {
        origin, ownerId, communityId: "community-1", sessionId: "session-1", sessionItemId: "item-1", attemptNumber: 1, idempotencyKey: key,
      } });
      answerEntered.resolve();
      if (options.answer === "unknown") return fulfill(route, { error: { code: "conflict", message: "Operation awaiting confirmation", retryable: true,
        details: { reason_code: "learning_finalization_pending", operation: { operation_kind: "study_answer", idempotency_key: key,
          operation_id: "answer-operation" }, retry_after_seconds: 1 } } }, 409, { "retry-after": "1" });
      const answer = firstAnswer(initial); current = answer.session;
      return fulfill(route, answer);
    }
    throw new Error(`Unexpected local API operation: ${request.method()} ${path}`);
  };
  const failures: unknown[] = [], inFlight = new Set<Promise<void>>();
  const observe = (route: Route) => {
    const run = handler(route).catch(async (error) => {
      if (!disposed) failures.push(error);
      try { await route.abort("failed"); } catch { /* Context disposal already terminated this owned request. */ }
    });
    inFlight.add(run); void run.finally(() => inFlight.delete(run)); return run;
  };
  await context.route("**/*", observe);
  return { counts, originalRequests, answerKeys, startEntered, answerEntered, releaseStart, namedOrigin,
    async dispose() {
      disposed = true; releaseStart.resolve(); releaseAccount.resolve();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("API fixture drain deadline")), 2_000);
      });
      try { await Promise.race([Promise.all([...inFlight]), deadline]); }
      finally { if (timer !== undefined) clearTimeout(timer); }
      await context.unroute("**/*", observe);
      if (failures.length > 0) throw new AggregateError(failures, "Local API boundary assertions failed");
    },
  };
}
