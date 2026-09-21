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
    | { kind: "activate_profile"; persona_id: string }
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
      persona: { kind: "existing", persona_id: "persona-1" },
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
  test("a resumed create-new draft follows the server activation lifecycle", async () => {
    const intent = creationIntent();
    const api = createCommunityCreationApi({
      fetchImpl: async () => response({ ...intent,
        draft: { ...intent.draft, persona: { kind: "create_new" } },
        persona_role_presentation: null,
      }),
      origin: "https://web.test",
    });
    const result = await api.getIntent({ intentId: "creation-1" });
    expect(result.nextAction).toEqual({ kind: "commit" });
  });

  test("persists a public name and exposes private activation without a community link", async () => {
    let body: unknown;
    const intent = creationIntent({ next_action: { kind: "activate_profile", persona_id: "pending-owner" }, revision: 2 });
    const api = createCommunityCreationApi({
      fetchImpl: async (input, init) => {
        body = await new Request(input, init).json();
        return response({ ...intent, draft: { ...intent.draft, persona: { kind: "create_new" }, public_name: "River Room" }, persona_role_presentation: null });
      },
      origin: "https://web.test",
      readCsrfToken: () => "csrf",
    });
    const saved = await api.createIntent({ draft: { ...createEmptyDraft(undefined), name: "New place", publicName: "River Room" }, idempotencyKey: "fresh-profile" });
    expect(body).toMatchObject({ draft: { public_name: "River Room", persona: { kind: "create_new" } } });
    expect(saved.nextAction).toEqual({ kind: "activate_profile", personaId: "pending-owner" });
    expect(saved.committedHref).toBeNull();
  });

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
      ...createEmptyDraft({ kind: "existing", personaId: "persona-1" }),
      description: "A place for careful listening",
      name: "Harbor songs",
    };

    await expect(api.createIntent({ draft, idempotencyKey: "create-key" })).resolves.toEqual({
      // The adapter re-seeds the client-only avatar seed and the wire carries
      // its own public_name view, so both are matched by type.
      draft: expect.objectContaining({ name: "Harbor songs", description: "A place for careful listening", persona: { kind: "existing", personaId: "persona-1" } }),
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
        persona: { kind: "existing", persona_id: "persona-1" },
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
    const draft = { ...createEmptyDraft({ kind: "existing", personaId: "persona-1" }), name: "Harbor songs" };

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
      draft: { ...createEmptyDraft({ kind: "existing", personaId: "persona-1" }), name: "Harbor songs" },
      idempotencyKey: "create-key",
    })).rejects.toBeInstanceOf(CommunityCreationApiError);
    expect(requested).toBe(false);
  });
});


test("preserves supported additional requirements when restoring a draft", async () => {
  const score = { requirement: "reputation-score", provider: "passport", minimumScore: 20 };
  const original = creationIntent();
  const api = createCommunityCreationApi({ origin: "https://web.test", fetchImpl: async () => response({ ...original, draft: { ...original.draft, policy: { version: 1, accessPaths: [{ id: "default", operator: "and", requirements: [{ requirement: "human-verification" }, score] }] } } }) });
  expect((await api.getIntent({ intentId: "saved" })).draft?.additionalRequirements).toEqual([score]);
});

test("rejects an unsupported saved policy instead of silently rewriting it", async () => {
  const original = creationIntent();
  const api = createCommunityCreationApi({ origin: "https://web.test", fetchImpl: async () => response({ ...original, draft: { ...original.draft, policy: { version: 1, accessPaths: [{ id: "custom-path", operator: "and", requirements: [{ requirement: "human-verification" }] }] } } }) });
  await expect(api.getIntent({ intentId: "saved" })).rejects.toMatchObject({ code: "unsupported_creation_contract" });
});


test("restores optional avatar references from the current creation contract", async () => {
  const original = creationIntent();
  const api = createCommunityCreationApi({ origin: "https://web.test", fetchImpl: async () => response({
    ...original,
    draft: {
      ...original.draft,
      persona: { kind: "create_new" },
      community_avatar_ref: "avatar-11111111-1111-4111-8111-111111111111",
      persona_avatar_ref: "avatar-22222222-2222-4222-8222-222222222222",
    },
    persona_role_presentation: null,
  }) });
  const restored = await api.getIntent({ intentId: "creation-1" });
  expect(restored.draft).toMatchObject({
    communityAvatarRef: "avatar-11111111-1111-4111-8111-111111111111",
    personaAvatarRef: "avatar-22222222-2222-4222-8222-222222222222",
  });
});

test("reserves, uploads and finalizes an avatar through the signed URL", async () => {
  localStorage.removeItem("pirate:community-avatar-upload:avatar-key");
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = {
    post_avatarUploadReservations: async () => ({
      asset_id: "avatar-11111111-1111-4111-8111-111111111111",
      upload_url: "https://storage.test/ingress/avatar",
      required_headers: [{ name: "content-type", value: "image/png" }],
      expires_at: "2099-01-01T00:00:00Z",
    }),
    post_avatarUploadReservationsAssetIdFinalize: async () => ({
      asset_id: "avatar-11111111-1111-4111-8111-111111111111",
      status: "ready" as const,
    }),
  } as never;
  const api = createCommunityCreationApi({
    client,
    readCsrfToken: () => "csrf-token",
    uploadFetch: async (input, init) => {
      requests.push({ url: input.toString(), init });
      return new Response(null, { status: 200 });
    },
  });
  const file = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
  await expect(api.uploadAvatar?.({ file, idempotencyKey: "avatar-key", purpose: "community" })).resolves.toBe("avatar-11111111-1111-4111-8111-111111111111");
  expect(requests[0]?.url).toBe("https://storage.test/ingress/avatar");
  expect(new Headers(requests[0]?.init?.headers).get("content-type")).toBe("image/png");
  expect(requests[0]?.init?.method).toBe("PUT");
  expect(requests[0]?.init?.credentials).toBe("omit");
  expect(new Headers(requests[0]?.init?.headers).has("x-csrf-token")).toBe(false);
  expect(new Headers(requests[0]?.init?.headers).has("authorization")).toBe(false);
  expect(new Headers(requests[0]?.init?.headers).has("content-length")).toBe(false);
});

test("replays a reserved asset after an ambiguous finalize without reserving again", async () => {
  const key = "avatar-recovery-key";
  localStorage.removeItem(`pirate:community-avatar-upload:${key}`);
  let reservations = 0;
  let finalizations = 0;
  let readinessChecks = 0;
  let rawUploads = 0;
  const client = {
    post_avatarUploadReservations: async () => {
      reservations += 1;
      return {
        asset_id: "avatar-33333333-3333-4333-8333-333333333333",
        upload_url: "https://storage.test/replay/avatar",
        required_headers: [{ name: "content-type", value: "image/png" }],
        expires_at: "2099-01-01T00:00:00Z",
      };
    },
    post_avatarUploadReservationsAssetIdFinalize: async () => {
      finalizations += 1;
      if (finalizations === 1) throw Object.assign(new Error("response lost"), { status: 409 });
      return { asset_id: "avatar-33333333-3333-4333-8333-333333333333", status: "ready" as const };
    },
    get_avatarsAssetId: async () => {
      readinessChecks += 1;
      throw Object.assign(new Error("not ready"), { status: 404 });
    },
  } as never;
  const api = createCommunityCreationApi({
    client,
    readCsrfToken: () => "csrf-token",
    uploadFetch: async () => {
      rawUploads += 1;
      return new Response(null, { status: 200 });
    },
  });
  const file = new Blob([new Uint8Array([4, 5, 6])], { type: "image/png" });
  await expect(api.uploadAvatar?.({ file, idempotencyKey: key, purpose: "persona" })).rejects.toMatchObject({ status: 404 });
  await expect(api.uploadAvatar?.({ file, idempotencyKey: key, purpose: "persona" })).resolves.toBe("avatar-33333333-3333-4333-8333-333333333333");
  expect(reservations).toBe(1);
  expect(rawUploads).toBe(2);
  expect(readinessChecks).toBe(1);
  expect(finalizations).toBe(2);
});
