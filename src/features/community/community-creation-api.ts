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
import {
  draftGatePolicy,
  type CreateCommunityDraft,
} from "./create-community/create-community-model";
import type {
  CommunityCreationIntentView,
  CreationNextAction,
} from "./community-creation-progress/community-creation-progress-model";

type CommunityCreationGeneratedClient = Pick<
  PirateApiClient,
  | "get_communityCreationIntentsIntentId"
  | "patch_communityCreationIntentsIntentId"
  | "post_communityCreationIntents"
  | "post_communityCreationIntentsIntentIdCommit"
>;

export interface CommunityCreationApiOptions {
  /** Test seam. Production uses the generated client through the same-origin Worker proxy. */
  client?: CommunityCreationGeneratedClient;
  fetchImpl?: ApiFetch;
  origin?: string | URL;
  readCsrfToken?: () => string | undefined;
}

export interface CommunityCreationWriteContext {
  idempotencyKey: string;
  signal?: AbortSignal;
}

export interface CommunityCreationApi {
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

export class CommunityCreationApiError extends Error {
  readonly code: "csrf_required" | "unsupported_creation_contract";

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

function mapIntent(response: PostCommunityCreationIntentsResponse): CommunityCreationIntentView {
  return {
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
  return {
    description: draft.description,
    name: draft.name,
    persona_id: draft.personaId,
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
