import { ApiClientError } from "@pirate/api-client";
import { describe, expect, it, vi } from "vitest";

import type { ActivePersonaPublicProjection } from "../../api/session";
import {
  activityPreparationAdmissible,
  activityPreparationCandidates,
  activityPreparationChoice,
  activityPreparationMessage,
  ActivityPersonaPreparationLocalError,
  createActivityPersonaPreparationApi,
} from "./activity-persona-preparation";

const persona = (
  personaId: string,
  communityId: string | null,
): ActivePersonaPublicProjection => ({
  avatarRef: null,
  communityBinding: communityId === null
    ? null
    : { bindingSource: "first_membership" as const, communityId },
  displayName: personaId,
  personaId,
  primaryPublicHandle: null,
});

const conflict = (status: number) =>
  new ApiClientError(
    { code: "conflict", name: "Conflict", retryable: false, status },
    { error: { code: "conflict", message: "conflict", retryable: false } },
  );

describe("activity persona preparation", () => {
  it("offers only unbound active personas as existing candidates", () => {
    expect(
      activityPreparationCandidates([
        persona("bound", "community"),
        persona("unbound", null),
      ]).map((candidate) => candidate.personaId),
    ).toEqual(["unbound"]);
  });

  it("selects nothing to prepare when the community already has a persona", () => {
    expect(activityPreparationChoice([persona("bound", "community")], "community")).toBeUndefined();
  });

  it("binds the single unbound persona and mints when none exists", () => {
    expect(activityPreparationChoice([persona("unbound", null)], "community")).toEqual({
      kind: "existing",
      personaId: "unbound",
    });
    expect(activityPreparationChoice([], "community")).toEqual({ kind: "create_new" });
    expect(
      activityPreparationChoice([persona("other", "elsewhere")], "community"),
    ).toEqual({ kind: "create_new" });
  });

  it("asks the browser to choose between several unbound personas", () => {
    expect(
      activityPreparationChoice([persona("a", null), persona("b", null)], "community"),
    ).toBeUndefined();
  });

  it("treats only an active preparation as activity-admissible", () => {
    expect(
      activityPreparationAdmissible({
        activity_presentation: null,
        community_id: "community",
        object: "activity_persona_preparation",
        persona_id: "persona",
        persona_status: "active",
      }),
    ).toBe(true);
    expect(
      activityPreparationAdmissible({
        activity_presentation: null,
        community_id: "community",
        object: "activity_persona_preparation",
        persona_id: "persona",
        persona_status: "pending_wallet",
      }),
    ).toBe(false);
  });

  it("sends the closed wire choice with the session CSRF options", async () => {
    const prepare = vi.fn(async () => ({
      activity_presentation: null,
      community_id: "community",
      object: "activity_persona_preparation" as const,
      persona_id: "persona",
      persona_status: "active" as const,
    }));
    const api = createActivityPersonaPreparationApi({
      client: { post_communitiesCommunityIdActivityPersonasPrepare: prepare },
      readCsrfToken: () => "csrf-token",
    });
    await expect(
      api.prepare({
        choice: { kind: "existing", personaId: "persona" },
        communityId: "community",
        idempotencyKey: "prepare-key",
      }),
    ).resolves.toMatchObject({ persona_status: "active" });
    expect(prepare).toHaveBeenCalledWith(
      {
        body: { choice: { kind: "existing", persona_id: "persona" }, idempotency_key: "prepare-key" },
        path: { communityId: "community" },
      },
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("refuses to call the server without a CSRF token", async () => {
    const prepare = vi.fn();
    const api = createActivityPersonaPreparationApi({
      client: { post_communitiesCommunityIdActivityPersonasPrepare: prepare },
      readCsrfToken: () => undefined,
    });
    await expect(
      api.prepare({
        choice: { kind: "create_new" },
        communityId: "community",
        idempotencyKey: "prepare-key",
      }),
    ).rejects.toBeInstanceOf(ActivityPersonaPreparationLocalError);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("maps typed preparation failures to honest recovery copy", () => {
    expect(activityPreparationMessage(conflict(409))).toContain("already bound");
    expect(activityPreparationMessage(conflict(404))).toContain("not available");
    expect(activityPreparationMessage(new ActivityPersonaPreparationLocalError("csrf_required", "x"))).toContain(
      "Sign in",
    );
    expect(activityPreparationMessage(new Error("network"))).toContain("Retry");
  });
});
