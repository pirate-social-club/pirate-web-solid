import { expect, type BrowserContext, type Route } from "playwright/test";
import type { OwnerStudyFinancialApi } from "../../../src/features/studying/guest-study-financial-api.ts";
import { authorityRead, deferred } from "./api.ts";
import { prepared, proof, proofCookie } from "./data.ts";
import { accountCsrf, fullPreviewHash, originalCredit, originalCreditId, originalParticipation, ownerSession, personas, post, publicPrepared, terms, user } from "./owner-data.ts";
/** Only the HTTP API boundary is scripted. Real SDK, route, IndexedDB and WebLocks remain owned product/browser implementations. */
export async function installOwnerApi(context: BrowserContext, origin: string, options: { unknownStart?: boolean; holdStart?: boolean; claimRecovery?: boolean } = {}) {
  let account = "account-A", startUncertain = options.unknownStart === true, verificationAccepted = false;
  let credit = originalCredit(), disposed = false;
  const startEntered = deferred(), releaseStart = deferred();
  const starts = new Map<string, { account: string; body: Parameters<OwnerStudyFinancialApi["startSession"]>[0]["body"]; result: Awaited<ReturnType<OwnerStudyFinancialApi["startSession"]>> }>();
  const counts = { start: 0, lookup: 0, selection: 0, claim: 0, named: 0, participationDetail: 0, guestOperations: 0 };
  const originalBodies: unknown[] = [], claimBodies: unknown[] = [], selectionBodies: unknown[] = [];
  const failures: unknown[] = [], inFlight = new Set<Promise<void>>();
  const namedOrigin = origin.replace("127.0.0.1", "localhost");
  await context.addCookies([
    { name: "__Host-pirate_csrf", value: accountCsrf, url: origin, secure: true, sameSite: "Lax" },
    { name: proofCookie, value: proof, url: origin, secure: true, httpOnly: true, sameSite: "Lax" },
    // Synthetic fixture cookie only; the scripted API doesn't claim RS256 or production authentication acceptance.
    { name: "__Host-pirate_session", value: "synthetic-account-A", url: origin, secure: true, httpOnly: true, sameSite: "Lax" },
  ]);
  const fulfill = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json",
    headers: { "cache-control": "no-store" }, body: JSON.stringify(body) });
  const handler = async (route: Route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin && url.origin !== namedOrigin) return route.abort("blockedbyclient");
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const path = url.pathname.slice(4), headers = await request.allHeaders();
    expect(headers.authorization).toBeUndefined();
    expect(headers["x-guest-credential-id"]).toBeUndefined();
    if (url.origin === namedOrigin) {
      counts.named++; expect(headers.cookie?.includes(proofCookie) ?? false).toBe(false);
      expect(headers.cookie?.includes("__Host-pirate_session") ?? false).toBe(false);
      return fulfill(route, { error: { code: "unauthorized", message: "Scripted named-host session absent", retryable: false } }, 401);
    }
    if (path === "/users/me") return fulfill(route, user(account, verificationAccepted));
    if (path === "/personas") return fulfill(route, personas(account));
    if (path === "/posts/post-1") return fulfill(route, post());
    if (path === "/communities/community-1/posts/post-1/study/v2") return fulfill(route, prepared().availability);
    if (path === "/communities/community-1/posts/post-1/study/public") {
      expect(headers.cookie).toBeUndefined(); return fulfill(route, prepared());
    }
    if (path === "/communities/community-1/posts/post-1/study/public/v2") {
      expect(headers.cookie).toBeUndefined(); return fulfill(route, publicPrepared());
    }
    if (path === "/communities/community-1/posts/post-1/study/owner/v1/preview") {
      expect(url.searchParams.get("persona_id")).toBe(`persona-${account}`);
      return fulfill(route, { reward_terms: terms, reward_preview_terms_hash: fullPreviewHash });
    }
    if (path.startsWith("/guest/") || path.includes("/study/guest/")) { counts.guestOperations++; throw new Error("Account path must not create Guest authority or forward Guest proof"); }
    if (request.method() !== "GET") {
      expect(headers.origin).toBe(origin); expect(headers["x-csrf-token"]).toBe(accountCsrf);
      expect(headers["x-guest-csrf-token"]).toBeUndefined();
    }
    if (path === "/communities/community-1/posts/post-1/study/owner/v1/sessions") {
      counts.start++;
      const body: Parameters<OwnerStudyFinancialApi["startSession"]>[0]["body"] = request.postDataJSON();
      expect(body).toMatchObject({ persona_id: `persona-${account}`, target_language: "ar", learner_band: "A1", reward_preview_terms_hash: fullPreviewHash,
        disclosure: { version: prepared().disclosure.version, accepted: true } });
      const saved = await authorityRead(request.frame().page(), origin);
      expect(saved).toMatchObject({ ownerStarts: expect.arrayContaining([{ accountId: account, communityId: "community-1", postId: "post-1", body,
        acceptedTerms: terms, disclosureText: prepared().disclosure.text, state: "submitted", sessionId: null, inventory: null }]) });
      expect(JSON.stringify(saved)).not.toContain(proof); originalBodies.push(body);
      const result = ownerSession(account, body.timezone); starts.set(body.idempotency_key, { account, body, result }); startEntered.resolve();
      if (options.holdStart) await releaseStart.promise;
      if (startUncertain) return route.abort("failed"); // Unknown response/COMMIT; neither absence nor known abort is inferred.
      return fulfill(route, result, 201);
    }
    if (path.startsWith("/communities/community-1/posts/post-1/study/owner/v1/session-operations/")) {
      counts.lookup++; const key = decodeURIComponent(path.split("/").at(-1) ?? ""), saved = starts.get(key);
      if (saved === undefined || saved.account !== account) throw new Error("Cross-Account original-key lookup refused");
      return fulfill(route, startUncertain ? { state: "pending_confirmation", result: null } : { state: "completed", result: saved.result });
    }
    if (path.startsWith("/communities/community-1/study/owner/v1/sessions/")) {
      const saved = [...starts.values()].find(v => v.account === account && path.endsWith(v.result.session.session_id));
      if (saved === undefined) throw new Error("Original Account session missing"); return fulfill(route, saved.result);
    }
    if (path === "/rewards/participations/owner/v1") return fulfill(route, { object: "owner_participation_list_v1", items: [originalParticipation()], next_cursor: null });
    if (path === "/rewards/participations/participation-original/owner/v1") { counts.participationDetail++; return fulfill(route, originalParticipation()); }
    if (path === "/users/me/rewards/owner-credits/v1") return fulfill(route, { object: "owner_reward_credit_list_v1", items: [credit], next_cursor: null });
    if (path === `/users/me/rewards/owner-credits/v1/${originalCreditId}`) return fulfill(route, credit);
    if (path === `/rewards/credits/${originalCreditId}/recipient-selections/v1`) {
      counts.selection++; const body: unknown = request.postDataJSON(); selectionBodies.push(body);
      expect(body).toMatchObject({ persona_id: `persona-${account}`, idempotency_key: expect.any(String) });
      const saved = await authorityRead(request.frame().page(), origin);
      expect(saved).toMatchObject({ ownerCreditCommands: expect.arrayContaining([{ accountId: account, creditId: originalCreditId, state: "submitted", kind: "recipient_selection", body }]) });
      const selection = { revision: 1, persona_id: `persona-${account}`, selected_at: "2026-10-13T01:00:00.000Z" };
      credit = { ...credit, updated_at: selection.selected_at, recipient: { kind: "guest_owner", selection, binding: null } }; return fulfill(route, { selection, credit });
    }
    if (path === `/rewards/credits/${originalCreditId}/owner-claims/v1`) {
      counts.claim++; const body: unknown = request.postDataJSON(); claimBodies.push(body);
      expect(body).toMatchObject({ selection_revision: 1, idempotency_key: expect.any(String) });
      const saved = await authorityRead(request.frame().page(), origin);
      expect(saved).toMatchObject({ ownerCreditCommands: expect.arrayContaining([{ accountId: account, creditId: originalCreditId, state: "submitted", kind: "owner_claim", body }]) });
      if (options.claimRecovery && counts.claim === 1) return route.abort("failed");
      if (!verificationAccepted) return fulfill(route, { outcome: "verification_missing", credit });
      const selection = credit.recipient.kind === "guest_owner" ? credit.recipient.selection : null;
      if (selection === null) throw new Error("Original recipient selection required");
      credit = { ...credit, state: "sent", available_atomic: "0", paid_atomic: "5", settled_at: "2026-10-13T02:00:00.000Z", updated_at: "2026-10-13T02:00:00.000Z",
        claim: { status: "accepted", payout_status: "confirmed" }, recipient: { kind: "guest_owner", selection, binding: { persona_id: selection.persona_id, selection_revision: 1, bound_at: "2026-10-13T02:00:00.000Z" } } };
      return fulfill(route, { outcome: "accepted", credit });
    }
    throw new Error(`Unexpected scripted Account operation: ${request.method()} ${path}`);
  };
  const observe = (route: Route) => {
    const run = handler(route).catch(async error => { failures.push(error); try { await route.abort("failed"); } catch { /* Already terminated owned request. */ } });
    inFlight.add(run); void run.then(() => inFlight.delete(run), () => inFlight.delete(run)); return run;
  };
  await context.route("**/*", observe);
  return { counts, originalBodies, claimBodies, selectionBodies, startEntered, releaseStart, namedOrigin,
    acceptScriptedVerification() { verificationAccepted = true; },
    async switchAccount(next: string) { account = next; startUncertain = false; await context.addCookies([{ name: "__Host-pirate_session", value: `synthetic-${next}`, url: origin, secure: true, httpOnly: true, sameSite: "Lax" }]); },
    async dispose() {
      if (disposed) return; disposed = true; releaseStart.resolve();
      const cleanup: unknown[] = []; let timer: ReturnType<typeof setTimeout> | undefined;
      try { await context.unroute("**/*", observe); } catch (error) { cleanup.push(error); }
      try {
        await Promise.race([(async () => { while (inFlight.size > 0) await Promise.all([...inFlight]); })(), new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Owned Account API drain deadline")), 2_000);
        })]);
      } catch (error) { cleanup.push(error); } finally { if (timer !== undefined) clearTimeout(timer); }
      if (failures.length + cleanup.length > 0) throw new AggregateError([...failures, ...cleanup], "Owned Account API boundary failed");
    },
  };
}
