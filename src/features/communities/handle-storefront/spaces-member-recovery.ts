import { ApiClientError, type GetUsersMeSpacesHandleRequestsResponse } from "@pirate/api-client";
import type { SessionSpacesMemberRecoveryApiClient } from "../../../api/handle-sales-client.ts";

export type SpacesMemberRequest = GetUsersMeSpacesHandleRequestsResponse["items"][number];
export type SpacesRecoverySession =
  | { readonly kind: "ready"; readonly accountId: string }
  | { readonly kind: "pending" | "anonymous" | "failed" };
export type SpacesRecoveryFilters = Readonly<{
  community_id?: string;
  offering_id?: string;
  namespace_root?: string;
  network?: "mainnet" | "testnet4" | "regtest";
}>;
export type SpacesMemberRecoveryState = Readonly<{
  kind: "account-pending" | "account-failed" | "signed-out" | "checking" | "ready" | "unknown";
  items: readonly SpacesMemberRequest[];
  nextCursor: string | null;
  loadingMore: boolean;
}>;

const empty = (kind: SpacesMemberRecoveryState["kind"]): SpacesMemberRecoveryState =>
  ({ kind, items: [], nextCursor: null, loadingMore: false });

const identifier = (value: unknown, maximum = 256): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= maximum && value.trim() === value && !/[\x00-\x1f\x7f]/u.test(value);

export function spacesRequestIdentity(item: SpacesMemberRequest): string {
  return `${item.kind}:${item.action.action_id}`;
}

/** Validate correlation, not ownership or permission for another command. */
function validateItem(item: SpacesMemberRequest, filters: SpacesRecoveryFilters): void {
  if (typeof item !== "object" || item === null || typeof item.action !== "object" || item.action === null
    || !identifier(item.action.action_id) || !identifier(item.action.idempotency_key, 128)
    || !/^[0-9a-f]{64}$/u.test(item.action.request_hash)) throw new Error("invalid_spaces_request");
  if (item.kind === "quote_refusal") {
    if (item.action.endpoint_template !== "/handle-quotes" || item.immutable_context !== "not_recorded"
      || item.result_kind !== "eligibility_required" || !identifier(item.offering_id) || !identifier(item.owner_persona_id)
      || (item.reason !== "evidence_required" && item.reason !== "qualification_unsatisfied")
      || filters.community_id !== undefined || filters.namespace_root !== undefined || filters.network !== undefined
      || (filters.offering_id !== undefined && filters.offering_id !== item.offering_id)) throw new Error("invalid_spaces_partial_scope");
    return;
  }
  if (item.kind !== "quote" && item.kind !== "reservation" && item.kind !== "claim") throw new Error("invalid_spaces_request_kind");
  const context = item.context;
  const progress = item.kind === "quote" ? item.quote : item.kind === "reservation" ? item.reservation : item.claim;
  const endpoint = item.kind === "quote" ? "/handle-quotes" : item.kind === "reservation" ? "/handle-reservations" : "/handle-claims";
  if (item.action.endpoint_template !== endpoint || !identifier(context.community_id)
    || !identifier(context.owner_persona_id) || !identifier(context.sale_namespace_activation_id)
    || !identifier(context.namespace_root, 62) || !["mainnet", "testnet4", "regtest"].includes(context.network)
    || !Number.isSafeInteger(context.offering_revision) || context.offering_revision < 1
    || progress.fulfillment.kind !== "spaces_native_v1" || progress.handle.family !== "spaces"
    || progress.offering_id !== context.offering_id || progress.offering_hash !== context.offering_hash
    || progress.owner_persona_id !== context.owner_persona_id
    || progress.sale_namespace_activation_id !== context.sale_namespace_activation_id
    || progress.sale_namespace_activation_generation !== context.sale_namespace_activation_generation
    || progress.handle.namespace_root !== context.namespace_root || progress.recipient.network !== context.network
    || (filters.community_id !== undefined && context.community_id !== filters.community_id)
    || (filters.offering_id !== undefined && context.offering_id !== filters.offering_id)
    || (filters.namespace_root !== undefined && context.namespace_root !== filters.namespace_root)
    || (filters.network !== undefined && context.network !== filters.network)
    || (item.kind === "quote" && item.quote.offering_revision !== context.offering_revision)) throw new Error("invalid_spaces_original_context");
}

function validatePage(page: GetUsersMeSpacesHandleRequestsResponse, filters: SpacesRecoveryFilters): void {
  if (page.object !== "spaces_member_request_readback_v1"
    || page.coverage !== "retained_committed_actions_with_stored_scope"
    || page.scope_incomplete_actions !== "omitted_when_scope_unprovable"
    || page.unlocated_request_outcome !== "unknown"
    || page.new_submission_admission !== "not_established_by_readback"
    || !Array.isArray(page.items) || page.items.length > 20
    || (page.next_cursor !== null && (typeof page.next_cursor !== "string" || page.next_cursor.length > 2048 || !/^smr1\.[A-Za-z0-9_-]+$/u.test(page.next_cursor)))) throw new Error("invalid_spaces_readback");
  const ids = new Set<string>();
  for (const item of page.items) {
    validateItem(item, filters);
    const id = spacesRequestIdentity(item);
    if (ids.has(id)) throw new Error("duplicate_spaces_request");
    ids.add(id);
  }
}

/** One account and one request generation own every private page/result. */
export function createSpacesMemberRecovery(options: {
  readonly client: Pick<SessionSpacesMemberRecoveryApiClient, "get_usersMeSpacesHandleRequests">;
  readonly filters?: SpacesRecoveryFilters;
  readonly currentAccountId?: () => string | undefined;
  readonly changed?: (state: SpacesMemberRecoveryState) => void;
}) {
  const filters = { ...options.filters };
  let state = empty("account-pending");
  let accountId: string | undefined;
  let generation = 0;
  let request = 0;
  let disposed = false;
  let active: AbortController | undefined;
  let requestedCursors = new Set<string>();
  const publish = (next: SpacesMemberRecoveryState) => {
    if (disposed) return;
    state = next;
    options.changed?.(state);
  };
  const invalidate = () => {
    generation++;
    request++;
    active?.abort();
    active = undefined;
    requestedCursors = new Set();
  };
  const load = async (cursor?: string): Promise<void> => {
    if (disposed || accountId === undefined) return;
    if (cursor !== undefined && (state.loadingMore || state.kind === "checking")) return;
    const owner = { accountId, generation, request: ++request };
    active?.abort();
    const controller = new AbortController();
    active = controller;
    const current = () => !disposed && accountId === owner.accountId && generation === owner.generation && request === owner.request && !controller.signal.aborted
      && (options.currentAccountId === undefined || options.currentAccountId() === owner.accountId);
    const previous = cursor === undefined ? [] : state.items;
    if (cursor === undefined) requestedCursors.clear();
    if (cursor !== undefined && requestedCursors.has(cursor)) {
      publish({ kind: "unknown", items: previous, nextCursor: null, loadingMore: false });
      return;
    }
    if (cursor !== undefined) requestedCursors.add(cursor);
    publish({ kind: cursor === undefined ? "checking" : "ready", items: previous, nextCursor: cursor ?? null, loadingMore: cursor !== undefined });
    try {
      const page = await options.client.get_usersMeSpacesHandleRequests({
        query: { ...filters, limit: "20", ...(cursor === undefined ? {} : { cursor }) },
      }, { credentials: "same-origin", signal: controller.signal });
      if (!current()) return;
      validatePage(page, filters);
      if (page.next_cursor !== null && requestedCursors.has(page.next_cursor)) throw new Error("repeated_spaces_cursor");
      const seen = new Set(previous.map(spacesRequestIdentity));
      if (page.items.some(item => seen.has(spacesRequestIdentity(item)))) throw new Error("overlapping_spaces_page");
      const items = [...previous, ...page.items];
      publish({ kind: items.length === 0 ? "unknown" : "ready", items, nextCursor: page.next_cursor, loadingMore: false });
    } catch (error) {
      if (!current()) return;
      if (error instanceof ApiClientError && error.status === 401) {
        invalidate();
        accountId = undefined;
        publish(empty("signed-out"));
      } else publish({ kind: "unknown", items: previous, nextCursor: null, loadingMore: false });
    } finally {
      if (active === controller) active = undefined;
    }
  };
  return {
    state: () => state,
    accountId: () => accountId,
    setSession(session: SpacesRecoverySession): boolean {
      if (disposed) return false;
      const next = session.kind === "ready" ? session.accountId : undefined;
      if (next !== undefined && next === accountId) return false;
      invalidate();
      accountId = next;
      publish(empty(session.kind === "ready" ? "checking" : session.kind === "anonymous" ? "signed-out" : session.kind === "failed" ? "account-failed" : "account-pending"));
      return next !== undefined;
    },
    refresh: () => load(),
    more: () => state.nextCursor === null ? Promise.resolve() : load(state.nextCursor),
    dispose() { invalidate(); accountId = undefined; disposed = true; state = empty("account-pending"); },
  };
}
