import { expect, test, vi } from "vitest";
import type { PirateApiRequestOptions } from "@pirate/api-client";
import { createCommunityHnsTxtApi, type HnsTxtAttachment } from "./community-hns-txt-api";

const attachment: HnsTxtAttachment = {
  attachment_intent_id: "intent-0qcm",
  root_label: "0qcm",
  status: "awaiting_txt",
  challenge: { name: "0qcm", value: "pirate-verification=nvs_example" },
  expires_at: "2026-09-28T12:00:00.000Z",
  route_href: null,
  retry_after_seconds: null,
};

test("TXT reads and writes use the generated operations with CSRF on writes", async () => {
  const current = vi.fn(async (_input: unknown) => ({ community_id: "community-1", attachment }));
  const start = vi.fn(async (_input: unknown, _options?: PirateApiRequestOptions) => attachment);
  const check = vi.fn(async (_input: unknown, _options?: PirateApiRequestOptions) => attachment);
  const api = createCommunityHnsTxtApi({
    client: {
      get_communitiesCommunityIdHnsTxtAttachments: current,
      post_communitiesCommunityIdHnsTxtAttachments: start,
      post_communitiesCommunityIdHnsTxtAttachmentsAttachmentIntentIdCheck: check,
    },
    readCsrfToken: () => "csrf-test",
  });

  await expect(api.current("community-1")).resolves.toEqual(attachment);
  await api.start("community-1", "0qcm", "start-key");
  await api.check("community-1", "intent-0qcm", "check-key");

  expect(current).toHaveBeenCalledWith({ path: { communityId: "community-1" } });
  expect(start.mock.calls[0]?.[0]).toEqual({
    path: { communityId: "community-1" },
    body: { root_label: "0qcm", idempotency_key: "start-key" },
  });
  expect(check.mock.calls[0]?.[0]).toEqual({
    path: { communityId: "community-1", attachmentIntentId: "intent-0qcm" },
    body: { idempotency_key: "check-key" },
  });
  for (const options of [start.mock.calls[0]?.[1], check.mock.calls[0]?.[1]]) {
    expect(options?.credentials).toBe("same-origin");
    const headers = options?.headers;
    expect(headers).toBeInstanceOf(Headers);
    if (!(headers instanceof Headers)) throw new Error("Expected CSRF headers");
    expect(headers.get("x-csrf-token")).toBe("csrf-test");
  }
});
