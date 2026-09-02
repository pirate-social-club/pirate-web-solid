import { createPirateApiClient } from "@pirate/api-client";

import {
  createGeneratedApiClient,
  readCsrfCookie,
  sessionRequestOptions,
} from "../../../api/client";
import type { ApiFetch } from "../../../api/proxy";
import type {
  CommunityModerationCapabilities,
  CommunityModerationCaseActionInput,
  CommunityModerationCaseDetail,
  CommunityModerationCaseList,
  CommunityModerationCaseView,
  CommunityModerationPolicy,
  CommunityModerationPolicyUpdateInput,
  CommunityModerationPort,
} from "./community-moderation-settings-model";

export type CommunityModerationCaseBundle = Readonly<{
  cases: CommunityModerationCaseList;
  details: ReadonlyArray<CommunityModerationCaseDetail>;
}>;

export interface CommunityModerationSettingsApi {
  actOnCase(input: CommunityModerationCaseActionInput & { signal?: AbortSignal }): Promise<void>;
  getCapabilities(input: { communityId: string; signal?: AbortSignal }): Promise<CommunityModerationCapabilities>;
  getCases(input: {
    communityId: string;
    signal?: AbortSignal;
    view: CommunityModerationCaseView;
  }): Promise<CommunityModerationCaseBundle>;
  getPolicy(input: { communityId: string; signal?: AbortSignal }): Promise<CommunityModerationPolicy>;
  updatePolicy(input: CommunityModerationPolicyUpdateInput & { signal?: AbortSignal }): Promise<CommunityModerationPolicy>;
}

export interface CommunityModerationSettingsApiOptions {
  /** Test seam. Production uses the generated client through the same-origin Worker proxy. */
  client?: CommunityModerationPort;
  fetchImpl?: ApiFetch;
  origin?: string | URL;
  readCsrfToken?: () => string | undefined;
}

export class CommunityModerationSettingsApiError extends Error {
  readonly code = "csrf_required" as const;

  constructor() {
    super("Refresh the page before changing community moderation settings.");
    this.name = "CommunityModerationSettingsApiError";
  }
}

export function createCommunityModerationSettingsApi(
  options: CommunityModerationSettingsApiOptions = {},
): CommunityModerationSettingsApi {
  let generatedClient = options.client;
  const client = (): CommunityModerationPort => {
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
    if (token === undefined) throw new CommunityModerationSettingsApiError();
    return sessionRequestOptions(token, { signal });
  };

  return {
    async actOnCase({ signal, ...input }) {
      await client().post_moderationCasesCaseRefActions(input, writeOptions(signal));
    },
    async getCapabilities({ communityId, signal }) {
      const response = await client().get_communitiesCommunityIdMeCapabilities(
        { path: { communityId } },
        { signal },
      );
      return response.capabilities;
    },
    async getCases({ communityId, signal, view }) {
      const cases = await client().get_communitiesCommunityIdModerationCases(
        { path: { communityId }, query: { view } },
        { signal },
      );
      const details = await Promise.all(cases.items.map((item) => (
        client().get_communitiesCommunityIdModerationCasesCaseRef(
          { path: { communityId, caseRef: item.case_ref } },
          { signal },
        )
      )));
      return { cases, details };
    },
    getPolicy({ communityId, signal }) {
      return client().get_communitiesCommunityIdModerationPolicy(
        { path: { communityId } },
        { signal },
      );
    },
    updatePolicy({ signal, ...input }) {
      return client().put_communitiesCommunityIdModerationPolicy(input, writeOptions(signal));
    },
  };
}
