import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { PirateApiClient } from "@pirate/api-client";
import { createSessionApiClient } from "../../api/client";
import { establishSessionAuthority, forgetSessionAuthority, replaceSessionAuthority } from "../../api/browser-session-events";
import { createDanceUploadApi, putDanceRecording, type DanceUploadAccess, type DanceReserveCommand, type DanceFinalizeCommand } from "./dance-upload-api";
import { dancePreparationFixture } from "./dance-preparation.fixture";

type Client = NonNullable<Parameters<typeof createDanceUploadApi>[0]>;
const session = { ...dancePreparationFixture.session, state: "awaiting_upload", upload_id: "upload", upload_state: "reserved" } as const;
const scope = { accountId: "dancer", communityId: session.community_id, postId: session.song_post_id };
const user: Awaited<ReturnType<PirateApiClient["get_usersMe"]>> = {
  object: "user", id: scope.accountId, verification_state: "unverified", created: 0,
  verification_capabilities: { unique_human: { state: "unverified" }, age_over_18: { state: "unverified" }, minimum_age: { state: "unverified" }, nationality: { state: "unverified" }, gender: { state: "unverified" }, wallet_score: { state: "unverified" } },
};
const reserve: DanceReserveCommand = { version: "dance-moderated-intake-v1", operation: "reserve", idempotency_key: "original-reserve", community_id: scope.communityId,
  session_id: session.session_id, terms_hash: session.terms_hash, content_type: "video/mp4", size_bytes: 5, duration_ms: session.body_end_ms };
const finalize: DanceFinalizeCommand = { version: "dance-moderated-intake-v1", operation: "finalize", idempotency_key: "original-finalize", community_id: scope.communityId,
  session_id: session.session_id, terms_hash: session.terms_hash, upload_id: "upload" };
const access: DanceUploadAccess = { version: "dance-moderated-upload-access-v1", upload_id: "upload",
  url: `https://${"a".repeat(32)}.r2.cloudflarestorage.com/private/moderated-dance/ingress/00000000-0000-4000-8000-000000000000/source?fixture=not-a-real-grant`,
  expires_at_ms: 20000, content_type: "video/mp4", size_bytes: 5, required_headers: [{ name: "content-type", value: "video/mp4" }, { name: "if-none-match", value: "*" }] };
const signal = () => new AbortController().signal;
beforeEach(establishSessionAuthority);
afterEach(() => { forgetSessionAuthority(); vi.restoreAllMocks(); });
function harness() {
  let csrf: string | undefined = "csrf-fixture";
  const client = {
    get_usersMe: vi.fn<Client["get_usersMe"]>(async () => user),
    get_communitiesCommunityIdDanceModeratedSessionsSessionId: vi.fn<Client["get_communitiesCommunityIdDanceModeratedSessionsSessionId"]>(async () => session),
    post_communitiesCommunityIdDanceModeratedSessionsSessionIdUpload: vi.fn<Client["post_communitiesCommunityIdDanceModeratedSessionsSessionIdUpload"]>(async () => ({ version: "dance-moderated-intake-receipt-v1", operation: "reserve", receipt_id: "receipt", session })),
    post_communitiesCommunityIdDanceModeratedSessionsSessionIdFinalizeUpload: vi.fn<Client["post_communitiesCommunityIdDanceModeratedSessionsSessionIdFinalizeUpload"]>(async () => ({ version: "dance-moderated-intake-receipt-v1", operation: "finalize", receipt_id: "receipt", session: { ...session, upload_state: "sealing" } })),
    post_communitiesCommunityIdDanceModeratedSessionsSessionIdUploadAccess: vi.fn<Client["post_communitiesCommunityIdDanceModeratedSessionsSessionIdUploadAccess"]>(async () => access),
  } satisfies Client;
  return { client, api: createDanceUploadApi(client, () => csrf), setCsrf: (value: string | undefined) => { csrf = value; } };
}

test("all upload POSTs use dispatch-time CSRF, original signal and same-origin credentials", async () => {
  const h = harness(), active = signal();
  h.client.get_usersMe.mockImplementationOnce(async () => { h.setCsrf("rotated"); return user; });
  await h.api.reserve(scope, reserve, active); await h.api.access(scope, session.session_id, "upload", session.terms_hash, active); await h.api.finalize(scope, finalize, active);
  const writes = [h.client.post_communitiesCommunityIdDanceModeratedSessionsSessionIdUpload.mock.calls[0], h.client.post_communitiesCommunityIdDanceModeratedSessionsSessionIdUploadAccess.mock.calls[0], h.client.post_communitiesCommunityIdDanceModeratedSessionsSessionIdFinalizeUpload.mock.calls[0]];
  for (const call of writes) {
    expect(call?.[1]?.signal).toBe(active); expect(call?.[1]?.credentials).toBe("same-origin");
    const headers = call?.[1]?.headers;
    if (!(headers instanceof Headers)) throw new Error("Expected request-scoped Headers");
    expect(headers.get("x-csrf-token")).toBe("rotated"); expect(headers.has("authorization")).toBe(false);
  }
});

test.each(["reserve", "access", "finalize"] as const)("missing CSRF prevents %s dispatch", async operation => {
  const h = harness(); h.setCsrf(undefined);
  const result = operation === "reserve" ? h.api.reserve(scope, reserve, signal()) : operation === "finalize" ? h.api.finalize(scope, finalize, signal())
    : h.api.access(scope, session.session_id, "upload", session.terms_hash, signal());
  await expect(result).rejects.toThrow("dance_upload_csrf_unavailable");
  expect(h.client.post_communitiesCommunityIdDanceModeratedSessionsSessionIdUpload).not.toHaveBeenCalled();
  expect(h.client.post_communitiesCommunityIdDanceModeratedSessionsSessionIdFinalizeUpload).not.toHaveBeenCalled();
  expect(h.client.post_communitiesCommunityIdDanceModeratedSessionsSessionIdUploadAccess).not.toHaveBeenCalled();
});

test("changed account refuses both pre-dispatch work and a late receipt", async () => {
  const h = harness(); h.client.get_usersMe.mockResolvedValueOnce({ ...user, id: "foreign" });
  await expect(h.api.reserve(scope, reserve, signal())).rejects.toThrow("dance_upload_account_changed");
  expect(h.client.post_communitiesCommunityIdDanceModeratedSessionsSessionIdUpload).not.toHaveBeenCalled();
  h.client.get_usersMe.mockResolvedValueOnce(user).mockResolvedValueOnce({ ...user, id: "foreign" });
  await expect(h.api.reserve(scope, reserve, signal())).rejects.toThrow("dance_upload_account_changed");
  expect(h.client.post_communitiesCommunityIdDanceModeratedSessionsSessionIdUpload).toHaveBeenCalledOnce();
});

test("epoch replacement in the identity continuation gap prevents upload dispatch", async () => {
  const h = harness(); h.client.get_usersMe.mockImplementationOnce(async () => { queueMicrotask(() => queueMicrotask(replaceSessionAuthority)); return user; });
  await expect(h.api.reserve(scope, reserve, signal())).rejects.toThrow("dance_upload_session_changed");
  expect(h.client.post_communitiesCommunityIdDanceModeratedSessionsSessionIdUpload).not.toHaveBeenCalled();
});

test("foreign upload capabilities and receipts are refused", async () => {
  const h = harness(); h.client.post_communitiesCommunityIdDanceModeratedSessionsSessionIdUploadAccess.mockResolvedValueOnce({ ...access, upload_id: "foreign" });
  await expect(h.api.access(scope, session.session_id, "upload", session.terms_hash, signal())).rejects.toThrow("dance_upload_target_changed");
  h.client.post_communitiesCommunityIdDanceModeratedSessionsSessionIdFinalizeUpload.mockResolvedValueOnce({ version: "dance-moderated-intake-receipt-v1", operation: "finalize", receipt_id: "receipt", session: { ...session, upload_id: "foreign" } });
  await expect(h.api.finalize(scope, finalize, signal())).rejects.toThrow("dance_upload_target_changed");
});

test("the real session client sends exact reserve/finalize bodies and fresh capability requests", async () => {
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/users/me")) return Response.json(user);
    if (path.endsWith("/upload-access")) return Response.json(access);
    return Response.json({ version: "dance-moderated-intake-receipt-v1", operation: path.endsWith("/finalize-upload") ? "finalize" : "reserve", receipt_id: "receipt", session });
  });
  const api = createDanceUploadApi(createSessionApiClient({ origin: "https://pirate.sc", fetchImpl }), () => "csrf");
  await api.reserve(scope, reserve, signal()); await api.access(scope, session.session_id, "upload", session.terms_hash, signal()); await api.finalize(scope, finalize, signal());
  const writes = fetchImpl.mock.calls.filter(([, init]) => init?.method === "POST");
  expect(writes.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([reserve,
    { version: "dance-moderated-upload-access-v1", upload_id: "upload", terms_hash: session.terms_hash }, finalize]);
});

function transfer() {
  return { access, uploadId: "upload", blob: new Blob(["bytes"], { type: "video/mp4" }), expiresAtMs: 21000, signal: signal(), assertCurrent() {} };
}
test.each([[200, "stored"], [412, "already_present"]] as const)("PUT status %i has outcome %s without claiming media acceptance", async (status, outcome) => {
  const fetchImpl = vi.fn(async () => new Response(null, { status })), input = transfer();
  await expect(putDanceRecording(input, { fetchImpl, nowMs: () => 10000 })).resolves.toBe(outcome);
  expect(fetchImpl).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ method: "PUT", credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer",
    body: input.blob, signal: input.signal, headers: { "content-type": "video/mp4", "if-none-match": "*" } }));
});

test.each([403, 409, 500])("PUT status %i stays unconfirmed", async status => {
  await expect(putDanceRecording(transfer(), { fetchImpl: async () => new Response(null, { status }), nowMs: () => 10000 })).rejects.toThrow("dance_upload_transfer_unconfirmed");
});

test("expired, oversized, overwrite-capable and foreign-destination grants cannot send bytes", async () => {
  const fetchImpl = vi.fn<typeof fetch>();
  const invalid: DanceUploadAccess[] = [
    { ...access, expires_at_ms: 10000 }, { ...access, expires_at_ms: 22000 }, { ...access, size_bytes: 6 }, { ...access, upload_id: "other" },
    { ...access, required_headers: [{ name: "content-type", value: "video/mp4" }] },
    { ...access, required_headers: [{ name: "content-type", value: "video/mp4" }, { name: "if-none-match", value: "replacement" }] },
    { ...access, url: "https://foreign.invalid/video" }, { ...access, url: access.url.replace("https:", "http:") }, { ...access, url: access.url.replace("/source", "/other") },
  ];
  for (const grant of invalid) await expect(putDanceRecording({ ...transfer(), access: grant }, { fetchImpl, nowMs: () => 10000 })).rejects.toThrow("dance_upload_access_invalid");
  expect(fetchImpl).not.toHaveBeenCalled();
});

test("abort or revoked authority cannot return PUT acknowledgement", async () => {
  const controller = new AbortController(), input = transfer();
  await expect(putDanceRecording({ ...input, signal: controller.signal }, { nowMs: () => 10000, fetchImpl: async () => { controller.abort(); return new Response(null); } })).rejects.toMatchObject({ name: "AbortError" });
  let valid = true;
  await expect(putDanceRecording({ ...input, assertCurrent() { if (!valid) throw new Error("revoked"); } }, { nowMs: () => 10000, fetchImpl: async () => { valid = false; return new Response(null); } })).rejects.toThrow("revoked");
});
