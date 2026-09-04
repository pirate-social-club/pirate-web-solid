import { describe, expect, test } from "vitest";
import { createEmptyDraft } from "./create-community/create-community-model";
import {
  CommunityCreationApiError,
  createCommunityCreationApi,
} from "./community-creation-api";

const policy = {
  accessPaths: [{
    id: "default",
    operator: "and",
    requirements: [{ requirement: "human-verification" }],
  }],
  version: 1,
};

const owner = {
  avatar_ref: null,
  display_name: "Harbor keeper",
  object: "persona",
  persona_id: "persona-1",
  primary_public_handle: "keeper",
};

interface CreationIntentOverrides {
  committed_resource?: {
    authority_version: "optional_route_v2";
    canonical_route: null;
    community_id: string;
    href: string;
    persona_role_presentation: { persona: typeof owner; role: "owner" };
  } | null;
  next_action?:
    | { kind: "commit" }
    | { kind: "none"; reason: "committed" }
    | {
        ceremony_intent_id: string;
        creation_intent_id: string;
        generation: number;
        kind: "start_verification";
        provider_id: string;
        requirement: "human_identity";
      };
  requirements?: {
    human_identity?: {
      ceremony_intent_id: string | null;
      generation: number;
      provider_id: string;
      requirement: "human_identity";
      requirement_hash: string;
      satisfied_at: string | null;
      status: "unmet" | "pending" | "satisfied" | "failed" | "expired";
    };
  };
  revision?: number;
  status?: "commit_ready" | "committed" | "verification_required";
}

function creationIntent(overrides: CreationIntentOverrides = {}) {
  return {
    canonical_policy_hash: "policy-hash",
    canonical_policy_revision: 1,
    committed_resource: null,
    creation_contract_version: "optional_route_v2",
    draft: {
      description: "A place for careful listening",
      name: "Harbor songs",
      persona_id: "persona-1",
      policy,
    },
    expires_at: "2026-08-31T00:00:00Z",
    intent_id: "creation-1",
    next_action: { kind: "commit" },
    persona_role_presentation: { persona: owner, role: "owner" },
    requirements: {},
    revision: 1,
    status: "commit_ready",
    ...overrides,
  };
}

function response(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

describe("createCommunityCreationApi", () => {
  test("creates a V2 intent with the shared draft model and protected request policy", async () => {
    const requests: Array<{ credentials: RequestCredentials | undefined; request: Request }> = [];
    const api = createCommunityCreationApi({
      fetchImpl: async (input, init) => {
        requests.push({ credentials: init?.credentials, request: new Request(input, init) });
        return response(creationIntent(), 201);
      },
      origin: "https://web.test",
      readCsrfToken: () => "csrf-1",
    });
    const draft = {
      ...createEmptyDraft("persona-1"),
      description: "A place for careful listening",
      name: "Harbor songs",
    };

    await expect(api.createIntent({ draft, idempotencyKey: "create-key" })).resolves.toEqual({
      committedHref: null,
      expiresAt: "2026-08-31T00:00:00Z",
      intentId: "creation-1",
      nextAction: { kind: "commit" },
      revision: 1,
      status: "commit_ready",
    });
    expect(requests[0]?.request.url).toBe("https://web.test/api/community-creation-intents");
    expect(requests[0]?.request.method).toBe("POST");
    expect(requests[0]?.request.headers.get("x-csrf-token")).toBe("csrf-1");
    expect(requests[0]?.credentials).toBe("same-origin");
    const createRequest = requests[0]?.request;
    if (createRequest === undefined) throw new Error("create request missing");
    const createBody = await createRequest.json();
    expect(createBody).toEqual({
      draft: {
        description: "A place for careful listening",
        name: "Harbor songs",
        persona_id: "persona-1",
        policy,
      },
      idempotency_key: "create-key",
    });
  });

  test("uses optimistic revisions for update and commit, then maps the committed href", async () => {
    const requests: Request[] = [];
    const api = createCommunityCreationApi({
      fetchImpl: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return request.url.endsWith("/commit")
          ? response(creationIntent({
              committed_resource: {
                authority_version: "optional_route_v2",
                canonical_route: null,
                community_id: "community-1",
                href: "/c/harbor-songs",
                persona_role_presentation: { persona: owner, role: "owner" },
              },
              next_action: { kind: "none", reason: "committed" },
              revision: 3,
              status: "committed",
            }), 201)
          : response(creationIntent({
              next_action: { kind: "commit" },
              revision: 2,
              status: "commit_ready",
            }));
      },
      origin: "https://web.test",
      readCsrfToken: () => "csrf-1",
    });
    const draft = { ...createEmptyDraft("persona-1"), name: "Harbor songs" };

    await expect(api.updateIntent({
      draft,
      expectedRevision: 1,
      idempotencyKey: "update-key",
      intentId: "creation-1",
    })).resolves.toMatchObject({ nextAction: { kind: "commit" }, revision: 2 });
    await expect(api.commitIntent({
      expectedRevision: 2,
      idempotencyKey: "commit-key",
      intentId: "creation-1",
    })).resolves.toMatchObject({
      committedHref: "/c/harbor-songs",
      nextAction: { kind: "none", reason: "committed" },
      revision: 3,
      status: "committed",
    });
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "PATCH https://web.test/api/community-creation-intents/creation-1",
      "POST https://web.test/api/community-creation-intents/creation-1/commit",
    ]);
    const updateRequest = requests[0];
    const commitRequest = requests[1];
    if (updateRequest === undefined || commitRequest === undefined) throw new Error("intent requests missing");
    const updateBody = await updateRequest.json();
    const commitBody = await commitRequest.json();
    expect(updateBody).toMatchObject({ expected_revision: 1, idempotency_key: "update-key" });
    expect(commitBody).toEqual({ expected_revision: 2, idempotency_key: "commit-key" });
  });

  test("reads an intent without requiring a CSRF token", async () => {
    const api = createCommunityCreationApi({
      fetchImpl: async () => response(creationIntent()),
      origin: "https://web.test",
      readCsrfToken: () => undefined,
    });

    await expect(api.getIntent({ intentId: "creation-1" })).resolves.toMatchObject({
      intentId: "creation-1",
      status: "commit_ready",
    });
  });

  test("turns a pre-boundary verification action into a terminal notice", async () => {
    const api = createCommunityCreationApi({
      fetchImpl: async () => response(creationIntent({
        next_action: {
          ceremony_intent_id: "ceremony-1",
          creation_intent_id: "creation-1",
          generation: 1,
          kind: "start_verification",
          provider_id: "very.web",
          requirement: "human_identity",
        },
        requirements: {
          human_identity: {
            ceremony_intent_id: "ceremony-1",
            generation: 1,
            provider_id: "very.web",
            requirement: "human_identity",
            requirement_hash: "requirement-hash",
            satisfied_at: null,
            status: "unmet",
          },
        },
        status: "verification_required",
      })),
      origin: "https://web.test",
    });

    await expect(api.getIntent({ intentId: "creation-1" })).resolves.toMatchObject({
      nextAction: { kind: "blocked", reason: "pre_boundary_verification" },
      status: "verification_required",
    });
  });

  test("does not send a write when the CSRF cookie is absent", async () => {
    let requested = false;
    const api = createCommunityCreationApi({
      fetchImpl: async () => {
        requested = true;
        return response(creationIntent(), 201);
      },
      origin: "https://web.test",
      readCsrfToken: () => undefined,
    });

    await expect(api.createIntent({
      draft: { ...createEmptyDraft("persona-1"), name: "Harbor songs" },
      idempotencyKey: "create-key",
    })).rejects.toBeInstanceOf(CommunityCreationApiError);
    expect(requested).toBe(false);
  });
});
