import type { PirateApiClient } from "@pirate/api-client";
import { createSessionApiClient, readCsrfCookie, sessionRequestOptions } from "../../api/client";
import { captureSessionAuthority, isCurrentSessionAuthority } from "../../api/browser-session-events";
import type { DancePreparationScope, DanceSession } from "./dance-preparation-api";

type Client = Pick<PirateApiClient, "get_usersMe" | "get_communitiesCommunityIdDanceModeratedSessionsSessionId"
  | "post_communitiesCommunityIdDanceModeratedSessionsSessionIdUpload"
  | "post_communitiesCommunityIdDanceModeratedSessionsSessionIdFinalizeUpload"
  | "post_communitiesCommunityIdDanceModeratedSessionsSessionIdUploadAccess">;
export type DanceReserveCommand = Parameters<Client["post_communitiesCommunityIdDanceModeratedSessionsSessionIdUpload"]>[0]["body"];
export type DanceFinalizeCommand = Parameters<Client["post_communitiesCommunityIdDanceModeratedSessionsSessionIdFinalizeUpload"]>[0]["body"];
export type DanceUploadReceipt = Awaited<ReturnType<Client["post_communitiesCommunityIdDanceModeratedSessionsSessionIdUpload"]>>;
export type DanceUploadAccess = Awaited<ReturnType<Client["post_communitiesCommunityIdDanceModeratedSessionsSessionIdUploadAccess"]>>;

/** Original commands belong in the durable journal before dispatch. A replay
 * receipt is historical; only a fresh session read determines current state. */
export function createDanceUploadApi(provided?: Client, csrf: () => string | undefined = readCsrfCookie) {
  const authority = captureSessionAuthority();
  const current = (signal: AbortSignal) => {
    signal.throwIfAborted();
    if (!isCurrentSessionAuthority(authority)) throw new Error("dance_upload_session_changed");
  };
  const writeOptions = (signal: AbortSignal) => {
    current(signal); const token = csrf(); current(signal);
    if (!token) throw new Error("dance_upload_csrf_unavailable");
    return sessionRequestOptions(token, { signal });
  };
  const sameSession = (scope: DancePreparationScope, session: DanceSession, sessionId: string, termsHash?: string) => {
    if (session.community_id !== scope.communityId || session.song_post_id !== scope.postId || session.session_id !== sessionId
      || (termsHash !== undefined && session.terms_hash !== termsHash)) throw new Error("dance_upload_target_changed");
  };
  const guarded = async <T>(scope: DancePreparationScope, signal: AbortSignal, invoke: (client: Client) => Promise<T>, validate: (result: T) => void) => {
    const accountId = scope.accountId, client = provided ?? createSessionApiClient();
    const identity = async () => {
      current(signal); const user = await client.get_usersMe(undefined, { signal }); current(signal);
      if (user.id !== accountId) throw new Error("dance_upload_account_changed");
    };
    await identity(); current(signal);
    const result = await invoke(client); current(signal);
    await identity(); validate(result); current(signal);
    return result;
  };
  return {
    session(scope: DancePreparationScope, sessionId: string, signal: AbortSignal) {
      scope = { ...scope };
      return guarded(scope, signal, client => client.get_communitiesCommunityIdDanceModeratedSessionsSessionId({ path: { communityId: scope.communityId, sessionId } }, { signal }),
        result => sameSession(scope, result, sessionId));
    },
    reserve(scope: DancePreparationScope, body: DanceReserveCommand, signal: AbortSignal) {
      scope = { ...scope }; body = { ...body };
      if (body.community_id !== scope.communityId) return Promise.reject(new Error("dance_upload_target_changed"));
      return guarded(scope, signal, client => client.post_communitiesCommunityIdDanceModeratedSessionsSessionIdUpload({ path: { communityId: scope.communityId, sessionId: body.session_id }, body }, writeOptions(signal)), result => {
        sameSession(scope, result.session, body.session_id, body.terms_hash);
        if (result.operation !== "reserve" || result.session.upload_id === null || result.session.body_end_ms !== body.duration_ms) throw new Error("dance_upload_target_changed");
      });
    },
    finalize(scope: DancePreparationScope, body: DanceFinalizeCommand, signal: AbortSignal) {
      scope = { ...scope }; body = { ...body };
      if (body.community_id !== scope.communityId) return Promise.reject(new Error("dance_upload_target_changed"));
      return guarded(scope, signal, client => client.post_communitiesCommunityIdDanceModeratedSessionsSessionIdFinalizeUpload({ path: { communityId: scope.communityId, sessionId: body.session_id }, body }, writeOptions(signal)), result => {
        sameSession(scope, result.session, body.session_id, body.terms_hash);
        if (result.operation !== "finalize" || result.session.upload_id !== body.upload_id) throw new Error("dance_upload_target_changed");
      });
    },
    access(scope: DancePreparationScope, sessionId: string, uploadId: string, termsHash: string, signal: AbortSignal) {
      scope = { ...scope };
      return guarded(scope, signal, client => client.post_communitiesCommunityIdDanceModeratedSessionsSessionIdUploadAccess({ path: { communityId: scope.communityId, sessionId },
        body: { version: "dance-moderated-upload-access-v1", upload_id: uploadId, terms_hash: termsHash } }, writeOptions(signal)), result => {
        if (result.upload_id !== uploadId) throw new Error("dance_upload_target_changed");
      });
    },
  };
}

/** One conditional PUT of the retained original. A 412 only observes an object
 * already present; it is not a verified-media or successful-review receipt. */
export async function putDanceRecording(input: {
  readonly access: DanceUploadAccess;
  readonly uploadId: string;
  readonly blob: Blob;
  readonly expiresAtMs: number;
  readonly signal: AbortSignal;
  readonly assertCurrent: () => void;
}, options: { readonly fetchImpl?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>; readonly nowMs?: () => number } = {}): Promise<"stored" | "already_present"> {
  const access = { ...input.access, required_headers: input.access.required_headers.map(header => ({ ...header })) };
  const guard = () => { input.signal.throwIfAborted(); input.assertCurrent(); };
  const now = (options.nowMs ?? Date.now)(); guard();
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(access.expires_at_ms)
    || now >= access.expires_at_ms || access.expires_at_ms > input.expiresAtMs
    || access.upload_id !== input.uploadId || access.content_type !== "video/mp4"
    || input.blob.type !== access.content_type || input.blob.size !== access.size_bytes || input.blob.size < 1
    || access.required_headers.length !== 2
    || access.required_headers.filter(header => header.name === "content-type" && header.value === "video/mp4").length !== 1
    || access.required_headers.filter(header => header.name === "if-none-match" && header.value === "*").length !== 1) throw new Error("dance_upload_access_invalid");
  let url: URL;
  try { url = new URL(access.url); } catch { throw new Error("dance_upload_access_invalid"); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.port
    || !/^[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/u.test(url.hostname)
    || !/^\/[^/]+\/moderated-dance\/ingress\/[a-f0-9-]{36}\/source$/u.test(url.pathname)) throw new Error("dance_upload_access_invalid");
  const response = await (options.fetchImpl ?? fetch)(url, { method: "PUT", credentials: "omit", redirect: "error", cache: "no-store",
    referrerPolicy: "no-referrer", signal: input.signal, headers: { "content-type": "video/mp4", "if-none-match": "*" }, body: input.blob });
  guard();
  if (response.status === 412) return "already_present";
  if (!response.ok) throw new Error("dance_upload_transfer_unconfirmed");
  return "stored";
}
