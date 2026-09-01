import { createPirateApiClient } from "@pirate/api-client-happy-path";

import {
  createGeneratedApiClient,
  readCsrfCookie,
  sessionRequestOptions,
} from "../../../api/client";
import type { ApiFetch } from "../../../api/proxy";
import type {
  CommunityNamesManagementPort,
  CommunityNamesManagementSnapshot,
  CommunityNamesOfferingCreateInput,
  CommunityNamesOfferingRevisionInput,
  CommunityNamesSaleNamespaceActivation,
  CommunityNamesSaleNamespaceActivationInput,
  CommunityNamesSaleNamespaceRevisionInput,
} from "./community-names-settings-model";

export interface CommunityNamesSettingsApi {
  activateSaleNamespace(
    input: CommunityNamesSaleNamespaceActivationInput & { signal?: AbortSignal },
  ): Promise<CommunityNamesSaleNamespaceActivation>;
  createOffering(input: CommunityNamesOfferingCreateInput & { signal?: AbortSignal }): Promise<void>;
  getSnapshot(input: { communityId: string; signal?: AbortSignal }): Promise<CommunityNamesManagementSnapshot>;
  reviseOffering(input: CommunityNamesOfferingRevisionInput & { signal?: AbortSignal }): Promise<void>;
  reviseSaleNamespace(input: CommunityNamesSaleNamespaceRevisionInput & { signal?: AbortSignal }): Promise<void>;
}

export interface CommunityNamesSettingsApiOptions {
  /** Test seam. Production uses the generated client through the same-origin Worker proxy. */
  client?: CommunityNamesManagementPort;
  fetchImpl?: ApiFetch;
  origin?: string | URL;
  readCsrfToken?: () => string | undefined;
}

export class CommunityNamesSettingsApiError extends Error {
  readonly code = "csrf_required" as const;

  constructor() {
    super("Refresh the page before changing community names.");
    this.name = "CommunityNamesSettingsApiError";
  }
}

export class CommunityNamesSettingsProtocolError extends Error {
  readonly code = "invalid_management_response" as const;

  constructor() {
    super("Community Names management returned an invalid response.");
    this.name = "CommunityNamesSettingsProtocolError";
  }
}

function assertProtocol(value: boolean): asserts value {
  if (!value) throw new CommunityNamesSettingsProtocolError();
}

async function collectPages<T>(
  load: (cursor?: string) => Promise<Readonly<{ items: ReadonlyArray<T>; next_cursor: string | null }>>,
): Promise<ReadonlyArray<T>> {
  const items: T[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 100; page += 1) {
    const response = await load(cursor);
    items.push(...response.items);
    if (response.next_cursor === null) return items;
    assertProtocol(response.next_cursor !== "" && !seen.has(response.next_cursor));
    seen.add(response.next_cursor);
    cursor = response.next_cursor;
  }
  throw new CommunityNamesSettingsProtocolError();
}

function paginationQuery(cursor?: string): Readonly<{ cursor?: string; limit: string }> {
  return cursor === undefined ? { limit: "50" } : { cursor, limit: "50" };
}

export function createCommunityNamesSettingsApi(
  options: CommunityNamesSettingsApiOptions = {},
): CommunityNamesSettingsApi {
  let generatedClient = options.client;
  const client = (): CommunityNamesManagementPort => {
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
    if (token === undefined) throw new CommunityNamesSettingsApiError();
    return sessionRequestOptions(token, { signal });
  };

  return {
    async activateSaleNamespace({ signal, ...input }) {
      const response = await client().post_communitiesCommunityIdHandleSaleNamespaces(
        input,
        writeOptions(signal),
      );
      assertProtocol(response.activation.community_id === input.path.communityId);
      return response.activation;
    },
    async createOffering({ signal, ...input }) {
      const response = await client().post_communitiesCommunityIdHandleOfferings(
        input,
        writeOptions(signal),
      );
      assertProtocol(
        response.offering.community_id === input.path.communityId
          && response.offering.sale_namespace_activation_id
            === input.body.terms.sale_namespace_activation_id,
      );
    },
    async getSnapshot({ communityId, signal }) {
      const context = await client().get_communitiesCommunityIdHandleSalesManagement(
        { path: { communityId } },
        { signal },
      );
      assertProtocol(context.community_id === communityId);
      const [saleNamespaces, offerings] = await Promise.all([
        collectPages((cursor) => client().get_communitiesCommunityIdHandleSalesManagementSaleNamespaces(
          {
            path: { communityId },
            query: paginationQuery(cursor),
          },
          { signal },
        )),
        collectPages((cursor) => client().get_communitiesCommunityIdHandleSalesManagementOfferings(
          {
            path: { communityId },
            query: paginationQuery(cursor),
          },
          { signal },
        )),
      ]);
      assertProtocol(
        saleNamespaces.every((item) => item.activation.community_id === communityId)
          && offerings.every((item) => item.offering.community_id === communityId),
      );
      return { context, offerings, saleNamespaces };
    },
    async reviseOffering({ signal, ...input }) {
      const response = await client().post_communitiesCommunityIdHandleOfferingsOfferingIdRevisions(
        input,
        writeOptions(signal),
      );
      assertProtocol(
        response.offering.community_id === input.path.communityId
          && response.offering.offering_id === input.path.offeringId
          && response.offering.status === input.body.requested_status,
      );
    },
    async reviseSaleNamespace({ signal, ...input }) {
      const response = await client().post_communitiesCommunityIdHandleSaleNamespacesActivationIdRevisions(
        input,
        writeOptions(signal),
      );
      assertProtocol(
        response.activation.community_id === input.path.communityId
          && response.activation.sale_namespace_activation_id === input.path.activationId
          && response.activation.status === input.body.requested_status,
      );
    },
  };
}
