import { normalizeIdentityCountryAlpha2 } from "../verification/nationality-country-codes.ts";
import {
  createPirateApiClient,
  type GetCommunityCreationIntentsIntentIdResponse,
  type PirateApiClient,
  type PostCommunityCreationIntentsResponse,
} from "@pirate/api-client";
import {
  createGeneratedApiClient,
  readCsrfCookie,
  sessionRequestOptions,
} from "../../api/client";
import type { ApiFetch } from "../../api/proxy";
import { toCommunityPersonaChoiceWire } from "../identity/community-persona-choice";
import {
  draftGatePolicy,
  type CreateCommunityDraft,
  type AdditionalGateRequirement,
} from "./create-community/create-community-model";
import { randomAvatarSeed } from "./create-community/generated-avatar";
import type {
  CommunityCreationIntentView,
  CreationNextAction,
} from "./community-creation-intent/community-creation-intent-model";

type CommunityCreationGeneratedClient = Pick<
  PirateApiClient,
  | "post_avatarUploadReservations"
  | "post_avatarUploadReservationsAssetIdFinalize"
  | "get_avatarsAssetId"
  | "get_communityCreationIntentsIntentId"
  | "patch_communityCreationIntentsIntentId"
  | "post_communityCreationIntents"
  | "post_communityCreationIntentsIntentIdCommit"
>;

export interface CommunityCreationApiOptions {
  /** Test seam. Production uses the generated client through the same-origin Worker proxy. */
  client?: CommunityCreationGeneratedClient;
  fetchImpl?: ApiFetch;
  /** Direct signed-object transport; never carries the session cookie. */
  uploadFetch?: ApiFetch;
  origin?: string | URL;
  readCsrfToken?: () => string | undefined;
}

export interface CommunityCreationWriteContext {
  idempotencyKey: string;
  signal?: AbortSignal;
}

export interface CommunityCreationApi {
  uploadAvatar?(input: CommunityCreationAvatarUploadContext): Promise<string>;
  createIntent(input: CommunityCreationWriteContext & {
    draft: CreateCommunityDraft;
  }): Promise<CommunityCreationIntentView>;
  getIntent(input: {
    intentId: string;
    signal?: AbortSignal;
  }): Promise<CommunityCreationIntentView>;
  updateIntent(input: CommunityCreationWriteContext & {
    draft: CreateCommunityDraft;
    expectedRevision: number;
    intentId: string;
  }): Promise<CommunityCreationIntentView>;
  commitIntent(input: CommunityCreationWriteContext & {
    expectedRevision: number;
    intentId: string;
  }): Promise<CommunityCreationIntentView>;
}

export interface CommunityCreationAvatarUploadContext {
  file: Blob;
  purpose: "community" | "persona";
  idempotencyKey: string;
  signal?: AbortSignal;
}

export class CommunityCreationApiError extends Error {
  readonly code: "csrf_required" | "persona_choice_required" | "unsupported_creation_contract";

  constructor(code: CommunityCreationApiError["code"], message: string) {
    super(message);
    this.name = "CommunityCreationApiError";
    this.code = code;
  }
}

function mapNextAction(
  action: PostCommunityCreationIntentsResponse["next_action"],
): CreationNextAction {
  switch (action.kind) {
    case "start_verification":
      return { kind: "blocked", reason: "pre_boundary_verification" };
    case "activate_profile":
      return { kind: action.kind, personaId: action.persona_id };
    case "commit":
      return { kind: action.kind };
    case "wait":
      return {
        kind: action.kind,
        reasonCode: action.reason_code,
        requirement: action.requirement,
        retryAfterSeconds: action.retry_after_seconds ?? undefined,
      };
    case "blocked":
      return { kind: action.kind, reason: action.reason };
    case "none":
      return { kind: action.kind, reason: action.reason };
  }
}

/** Validate the open JSON policy before reconstructing an editable draft. */
function additionalDraftRequirements(policy: PostCommunityCreationIntentsResponse["draft"]["policy"]): AdditionalGateRequirement[] {
  const unsupported = () => new CommunityCreationApiError("unsupported_creation_contract", "This saved community uses a membership policy that this form cannot edit.");
  const paths = policy.accessPaths;
  if (policy.version !== 1 || !Array.isArray(paths) || paths.length !== 1) throw unsupported();
  const path = paths[0];
  if (!path || typeof path !== "object" || path.id !== "default" || path.operator !== "and" || !Array.isArray(path.requirements)) throw unsupported();
  const additional: AdditionalGateRequirement[] = [];
  let human = 0;
  for (const requirement of path.requirements) {
    if (!requirement || typeof requirement !== "object") throw unsupported();
    if (requirement.requirement === "human-verification") { human += 1; continue; }
    if (requirement.requirement === "nationality-allowed") {
      if (!Array.isArray(requirement.allowedCountries) || requirement.allowedCountries.length === 0
        || requirement.allowedCountries.length > 256 || additional.some(value => value.requirement === "nationality-allowed")) throw unsupported();
      const countries: Array<string | null> = requirement.allowedCountries.map(normalizeIdentityCountryAlpha2);
      if (countries.some(value => value === null)) throw unsupported();
      additional.push({ requirement: "nationality-allowed", allowedCountries: countries.filter((value): value is string => value !== null) });
      continue;
    }
    if (requirement.requirement !== "reputation-score" || requirement.provider !== "passport"
      || typeof requirement.minimumScore !== "number" || !Number.isFinite(requirement.minimumScore)) throw unsupported();
    additional.push({ requirement: "reputation-score", provider: "passport", minimumScore: requirement.minimumScore });
  }
  if (human !== 1) throw unsupported();
  return additional;
}

const avatarSeedKey = (intentId: string) => `pirate:community-avatar-seed:${intentId}`;
const newAvatarSeedKey = "pirate:community-avatar-seed:new";
const avatarUploadKey = (idempotencyKey: string) => `pirate:community-avatar-upload:${idempotencyKey}`;

interface AvatarUploadRecord {
  assetId: string;
  contentType: string;
  expiresAt: string;
  headers: Array<{ name: string; value: string }>;
  purpose: "community" | "persona";
  size: number;
  uploadUrl: string;
  finalized: boolean;
}

function readStorage(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeStorage(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* storage is optional */ }
}

function readSessionStorage(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

function writeSessionStorage(key: string, value: string): void {
  try { sessionStorage.setItem(key, value); } catch { /* storage is optional */ }
}

function readAvatarUploadRecord(idempotencyKey: string): AvatarUploadRecord | undefined {
  const raw = readStorage(avatarUploadKey(idempotencyKey));
  if (raw === null) return undefined;
  try {
    const record: unknown = JSON.parse(raw);
    if (typeof record !== "object" || record === null) return undefined;
    // SAFETY: The parsed value is treated as partial until every persisted field is checked below.
    const value = record as Partial<AvatarUploadRecord>;
    if (typeof value.assetId !== "string" || typeof value.contentType !== "string"
      || typeof value.expiresAt !== "string" || !Array.isArray(value.headers)
      || (value.purpose !== "community" && value.purpose !== "persona")
      || typeof value.size !== "number" || typeof value.uploadUrl !== "string"
      || typeof value.finalized !== "boolean") return undefined;
    // SAFETY: Every AvatarUploadRecord field has been checked before this value is returned.
    return value as AvatarUploadRecord;
  } catch { return undefined; }
}

function writeAvatarUploadRecord(idempotencyKey: string, record: AvatarUploadRecord): void {
  writeStorage(avatarUploadKey(idempotencyKey), JSON.stringify(record));
}

/** Keep the local generated choice stable until the server stores its image. */
export function rememberProfileAvatarSeed(intentId: string, seed: string): void {
  writeStorage(avatarSeedKey(intentId), seed);
}

export function rememberNewProfileAvatarSeed(seed: string): void {
  writeSessionStorage(newAvatarSeedKey, seed);
}

export function readNewProfileAvatarSeed(): string | undefined {
  return readSessionStorage(newAvatarSeedKey) ?? undefined;
}

export function forgetNewProfileAvatarSeed(): void {
  try { sessionStorage.removeItem(newAvatarSeedKey); } catch { /* storage is optional */ }
}

function profileAvatarSeed(intentId: string): string {
  return readStorage(avatarSeedKey(intentId)) ?? randomAvatarSeed();
}

function mapIntent(response: PostCommunityCreationIntentsResponse): CommunityCreationIntentView {
  return {
    ...(response.avatar_outcomes === undefined || response.avatar_outcomes === null ? {} : { avatarOutcomes: response.avatar_outcomes }),
    draft: response.committed_resource ? undefined : {
      name: response.draft.name,
      description: response.draft.description,
      publicName: response.draft.public_name ?? "",
      ...(response.draft.community_avatar_ref === undefined ? {} : { communityAvatarRef: response.draft.community_avatar_ref ?? undefined }),
      ...(response.draft.persona_avatar_ref === undefined ? {} : { personaAvatarRef: response.draft.persona_avatar_ref ?? undefined }),
      persona: response.draft.persona.kind === "existing"
        ? { kind: "existing", personaId: response.draft.persona.persona_id }
        : { kind: "create_new" },
      additionalRequirements: additionalDraftRequirements(response.draft.policy),
      profileAvatarSeed: profileAvatarSeed(response.intent_id),
    },
    committedHref: response.committed_resource?.href ?? null,
    expiresAt: response.expires_at,
    intentId: response.intent_id,
    nextAction: mapNextAction(response.next_action),
    revision: response.revision,
    status: response.status,
  };
}

function requireCurrentIntent(
  response: GetCommunityCreationIntentsIntentIdResponse,
): PostCommunityCreationIntentsResponse {
  if (!("creation_contract_version" in response)) {
    throw new CommunityCreationApiError(
      "unsupported_creation_contract",
      "This community creation draft uses an older route contract.",
    );
  }
  return response;
}

function draftBody(draft: CreateCommunityDraft) {
  if (draft.persona === undefined) {
    throw new CommunityCreationApiError(
      "persona_choice_required",
      "Choose the persona this community presents before saving the draft.",
    );
  }
  return {
    ...(draft.persona.kind === "create_new" ? { public_name: draft.publicName?.trim() ?? "" } : {}),
    ...(draft.communityAvatarRef === undefined ? {} : { community_avatar_ref: draft.communityAvatarRef }),
    ...(draft.personaAvatarRef === undefined ? {} : { persona_avatar_ref: draft.personaAvatarRef }),
    description: draft.description,
    name: draft.name,
    persona: toCommunityPersonaChoiceWire(draft.persona),
    policy: draftGatePolicy(draft),
  };
}

export function createCommunityCreationApi(
  options: CommunityCreationApiOptions = {},
): CommunityCreationApi {
  let generatedClient = options.client;
  const client = (): CommunityCreationGeneratedClient => {
    generatedClient ??= createGeneratedApiClient(
      createPirateApiClient,
      { fetchImpl: options.fetchImpl, origin: options.origin },
      { credentials: "same-origin" },
    );
    return generatedClient;
  };
  const csrfToken = options.readCsrfToken ?? readCsrfCookie;
  const uploadFetch = options.uploadFetch ?? fetch;
  const writeOptions = (signal?: AbortSignal) => {
    const token = csrfToken();
    if (token === undefined) {
      throw new CommunityCreationApiError(
        "csrf_required",
        "Refresh the page before changing this community draft.",
      );
    }
    return sessionRequestOptions(token, { signal });
  };

  return {
    async uploadAvatar({ file, idempotencyKey, purpose, signal }) {
      const contentType = file.type;
      if ((contentType !== "image/jpeg" && contentType !== "image/png" && contentType !== "image/webp")
        || !Number.isSafeInteger(file.size) || file.size < 1) {
        throw new Error("avatar_upload_invalid");
      }
      let record = readAvatarUploadRecord(idempotencyKey);
      if (record?.finalized && record.purpose === purpose && record.contentType === contentType && record.size === file.size) {
        return record.assetId;
      }
      const expiry = record === undefined ? Number.POSITIVE_INFINITY : Date.parse(record.expiresAt);
      const expired = record !== undefined && !record.finalized && (!Number.isFinite(expiry) || expiry <= Date.now());
      if (record === undefined || expired || record.purpose !== purpose || record.contentType !== contentType || record.size !== file.size) {
        const reservationKey = expired && record !== undefined
          ? `community:avatar-renew:${record.assetId}`
          : idempotencyKey;
        const reservation = await client().post_avatarUploadReservations({
          body: { byte_length: file.size, content_type: contentType, idempotency_key: reservationKey, purpose },
        }, writeOptions(signal));
        record = {
          assetId: reservation.asset_id,
          contentType,
          expiresAt: reservation.expires_at,
          headers: reservation.required_headers.map(header => ({ name: header.name, value: header.value })),
          purpose,
          size: file.size,
          uploadUrl: reservation.upload_url,
          finalized: false,
        };
        writeAvatarUploadRecord(idempotencyKey, record);
      }
      const headers = new Headers();
      for (const header of record.headers) headers.set(header.name, header.value);
      const uploaded = await uploadFetch(record.uploadUrl, {
        body: file,
        credentials: "omit",
        headers,
        method: "PUT",
        signal,
      });
      if (!uploaded.ok) throw new Error("avatar_upload_failed");
      try {
        await client().post_avatarUploadReservationsAssetIdFinalize({
          path: { assetId: record.assetId },
        }, writeOptions(signal));
      } catch (error) {
        // A lost finalize response can leave the server ready while the
        // browser sees a conflict on replay. Confirm readiness before retrying
        // the reservation; this preserves the original asset idempotently.
        if (typeof error !== "object" || error === null || !("status" in error) || error.status !== 409) throw error;
        const delivered = await client().get_avatarsAssetId({
          headers: {}, path: { assetId: record.assetId },
        }, { signal });
        if (delivered.status !== 200 && delivered.status !== 304) throw error;
      }
      writeAvatarUploadRecord(idempotencyKey, { ...record, finalized: true });
      return record.assetId;
    },
    async commitIntent({ expectedRevision, idempotencyKey, intentId, signal }) {
      const response = await client().post_communityCreationIntentsIntentIdCommit({
        body: {
          expected_revision: expectedRevision,
          idempotency_key: idempotencyKey,
        },
        path: { intentId },
      }, writeOptions(signal));
      return mapIntent(requireCurrentIntent(response));
    },
    async createIntent({ draft, idempotencyKey, signal }) {
      const response = await client().post_communityCreationIntents({
        body: {
          draft: draftBody(draft),
          idempotency_key: idempotencyKey,
        },
      }, writeOptions(signal));
      return mapIntent(response);
    },
    async getIntent({ intentId, signal }) {
      const response = await client().get_communityCreationIntentsIntentId(
        { path: { intentId } },
        { signal },
      );
      return mapIntent(requireCurrentIntent(response));
    },
    async updateIntent({ draft, expectedRevision, idempotencyKey, intentId, signal }) {
      const response = await client().patch_communityCreationIntentsIntentId({
        body: {
          draft: draftBody(draft),
          expected_revision: expectedRevision,
          idempotency_key: idempotencyKey,
        },
        path: { intentId },
      }, writeOptions(signal));
      return mapIntent(response);
    },
  };
}
