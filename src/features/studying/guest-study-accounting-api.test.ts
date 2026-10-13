import type { PirateApiClient } from "@pirate/api-client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createGuestStudyAccountingApi } from "./guest-study-accounting-api";
function actualHeaders(value: unknown): Headers {
  if (value === undefined) return new Headers();
  if (!(value instanceof Headers)) throw new TypeError("Expected actual request Headers");
  return value;
}

const origin = "https://app.pirate.test", intentId = `gai_${"C".repeat(21)}A`;
beforeEach(() => vi.stubGlobal("location", { origin }));
afterEach(() => vi.unstubAllGlobals());
test("attachment uses ordinary session CSRF plus separate Guest CSRF; claim never sends Guest authority", async () => {
  const client = {
    post_guestAttachmentIntentsIdPrepare: vi.fn<PirateApiClient["post_guestAttachmentIntentsIdPrepare"]>().mockResolvedValue({ intent_id: intentId, target_revision: 1, state: "awaiting_confirmation", account_confirmation: { account_id: "account", display_name: null } }),
    post_guestAttachmentIntentsIdConfirm: vi.fn<PirateApiClient["post_guestAttachmentIntentsIdConfirm"]>().mockResolvedValue({ attachment_id: intentId, owner_id: "owner", account_id: "account", state: "bound", bound_at: "2026-10-14T10:00:00.000Z" }),
    get_usersMeGuestAttachmentsId: vi.fn<PirateApiClient["get_usersMeGuestAttachmentsId"]>(),
    post_rewardsCreditsCreditIdRecipientSelectionsV1: vi.fn<PirateApiClient["post_rewardsCreditsCreditIdRecipientSelectionsV1"]>(),
    post_rewardsCreditsCreditIdOwnerClaimsV1: vi.fn<PirateApiClient["post_rewardsCreditsCreditIdOwnerClaimsV1"]>(),
  };
  const api = createGuestStudyAccountingApi({ origin, client, readAccountCsrf: () => "ordinary", readGuestCsrf: () => "A".repeat(43) });
  await api.prepareAttachment({ path: { id: intentId }, headers: { "x-guest-credential-id": "credential" } });
  expect(actualHeaders(client.post_guestAttachmentIntentsIdPrepare.mock.calls[0]?.[1]?.headers).get("x-csrf-token")).toBe("ordinary");
  expect(actualHeaders(client.post_guestAttachmentIntentsIdPrepare.mock.calls[0]?.[1]?.headers).get("x-guest-csrf-token")).toBe("A".repeat(43));
  expect(client.post_guestAttachmentIntentsIdPrepare.mock.calls[0]?.[0]).toEqual({ path: { id: intentId }, headers: { "x-guest-credential-id": "credential" } });
  const noGuestCsrf = createGuestStudyAccountingApi({ origin, client, readAccountCsrf: () => "ordinary", readGuestCsrf: () => undefined });
  expect(() => noGuestCsrf.prepareAttachment({ path: { id: intentId }, headers: { "x-guest-credential-id": "credential" } })).toThrow("Guest ceremony CSRF required");
  expect(client.post_guestAttachmentIntentsIdPrepare).toHaveBeenCalledOnce();
  await api.confirmAttachment({ path: { id: intentId }, headers: { "x-guest-credential-id": "credential" }, body: { expected_account_id: "account", target_revision: 1 } });
  const headers = actualHeaders(client.post_guestAttachmentIntentsIdConfirm.mock.calls[0]?.[1]?.headers);
  expect(headers.get("x-csrf-token")).toBe("ordinary"); expect(headers.get("x-guest-csrf-token")).toBe("A".repeat(43));
  await api.claimCredit({ path: { creditId: "credit" }, body: { idempotency_key: "original", selection_revision: 1 } });
  const claim = actualHeaders(client.post_rewardsCreditsCreditIdOwnerClaimsV1.mock.calls[0]?.[1]?.headers);
  expect(claim.get("x-csrf-token")).toBe("ordinary"); expect(claim.has("x-guest-csrf-token")).toBe(false); expect(claim.has("x-guest-credential-id")).toBe(false);
  vi.stubGlobal("location", { origin: "https://name.pirate.test" });
  expect(() => api.prepareAttachment({ path: { id: intentId }, headers: { "x-guest-credential-id": "credential" } })).toThrow();
  expect(client.post_guestAttachmentIntentsIdPrepare).toHaveBeenCalledOnce();
});
