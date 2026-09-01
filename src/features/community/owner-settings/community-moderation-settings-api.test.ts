import { describe, expect, test } from "vitest";

import {
  MODERATION_CASE_DETAIL,
  MODERATION_POLICY,
  MODERATION_VIEW_AND_ACT,
  OPEN_MODERATION_CASES,
  SECOND_MODERATION_CASE_DETAIL,
} from "./community-moderation-settings-fixtures";
import {
  CommunityModerationSettingsApiError,
  createCommunityModerationSettingsApi,
} from "./community-moderation-settings-api";
import {
  moderationCaseActionInput,
  moderationPolicyDecisions,
  moderationPolicyUpdateInput,
} from "./community-moderation-settings-model";

function response(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

describe("createCommunityModerationSettingsApi", () => {
  test("loads owner capabilities and expands case detail through the generated client", async () => {
    const requests: Request[] = [];
    const api = createCommunityModerationSettingsApi({
      fetchImpl: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.url.endsWith("/me/capabilities")) {
          return response({
            community_id: "community_midnight",
            role: "owner",
            role_assignment_id: "owner-assignment-1",
            capabilities: MODERATION_VIEW_AND_ACT,
          });
        }
        if (request.url.includes("/moderation/cases/") && !request.url.includes("?")) {
          return response(request.url.endsWith("case_report_1038")
            ? SECOND_MODERATION_CASE_DETAIL
            : MODERATION_CASE_DETAIL);
        }
        return response(OPEN_MODERATION_CASES);
      },
      origin: "https://web.test",
    });

    await expect(api.getCapabilities({ communityId: "community_midnight" }))
      .resolves.toEqual(MODERATION_VIEW_AND_ACT);
    const bundle = await api.getCases({ communityId: "community_midnight", view: "open" });
    expect(bundle.cases).toEqual(OPEN_MODERATION_CASES);
    expect(bundle.details).toHaveLength(OPEN_MODERATION_CASES.items.length);
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://web.test/api/communities/community_midnight/me/capabilities",
      "GET https://web.test/api/communities/community_midnight/moderation/cases?view=open",
      "GET https://web.test/api/communities/community_midnight/moderation/cases/case_report_1042",
      "GET https://web.test/api/communities/community_midnight/moderation/cases/case_report_1038",
    ]);
  });

  test("preserves action, policy, revision, idempotency and CSRF fences", async () => {
    const requests: Request[] = [];
    const api = createCommunityModerationSettingsApi({
      fetchImpl: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return request.method === "PUT" ? response(MODERATION_POLICY) : response({
          version: "moderation-case-action-result-v2",
          action_id: "action-1",
          case_ref: MODERATION_CASE_DETAIL.case.case_ref,
          action: "reject",
          target_status: "blocked",
        });
      },
      origin: "https://web.test",
      readCsrfToken: () => "csrf-1",
    });
    const action = moderationCaseActionInput({
      action: "reject",
      case: MODERATION_CASE_DETAIL.case,
      idempotencyKey: "case-operation-1",
    });
    const policy = moderationPolicyUpdateInput({
      decisions: moderationPolicyDecisions(MODERATION_POLICY),
      policy: MODERATION_POLICY,
    });

    await api.actOnCase(action);
    await expect(api.updatePolicy(policy)).resolves.toEqual(MODERATION_POLICY);

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "POST https://web.test/api/moderation/cases/case_report_1042/actions",
      "PUT https://web.test/api/communities/community_midnight/moderation/policy",
    ]);
    expect(requests.every((request) => request.headers.get("x-csrf-token") === "csrf-1")).toBe(true);
    await expect(requests[0]!.json()).resolves.toEqual(action.body);
    await expect(requests[1]!.json()).resolves.toEqual(policy.body);
  });

  test("does not send moderation writes without the readable CSRF cookie", async () => {
    let requested = false;
    const api = createCommunityModerationSettingsApi({
      fetchImpl: async () => {
        requested = true;
        return response({});
      },
      origin: "https://web.test",
      readCsrfToken: () => undefined,
    });

    await expect(api.actOnCase(moderationCaseActionInput({
      action: "reject",
      case: MODERATION_CASE_DETAIL.case,
      idempotencyKey: "case-operation-1",
    }))).rejects.toBeInstanceOf(CommunityModerationSettingsApiError);
    expect(requested).toBe(false);
  });
});
