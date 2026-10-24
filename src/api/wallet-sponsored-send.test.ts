import { expect, test, vi } from "vitest";
import { ApiClientError, ApiClientProtocolError, ApiClientResponseValidationError, ApiClientUnexpectedError } from "@pirate/api-client";
import { createSessionApiClient } from "./client.ts";
import { createWalletSponsoredSendData, walletSendVerificationRequired } from "./wallet-sponsored-send.ts";
import { BASE_SPONSORED_SEND } from "./sponsored-send-network.ts";

test("the generated persona-bound Send intent uses the owned proxy and CSRF", async () => {
  const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ intent_id: "wallet-send_1", persona_id: "persona_1", provider_id: "very.web", purpose: "wallet_send" }));
  const client = createSessionApiClient({ origin: "https://app.test", fetchImpl });
  const data = createWalletSponsoredSendData(client, () => "test_csrf");
  await expect(data.issueVerificationIntent("persona_1")).resolves.toBe("wallet-send_1");
  const [input, init] = fetchImpl.mock.calls[0];
  expect(new URL(input instanceof Request ? input.url : input.toString()).pathname).toBe("/api/wallet/personas/persona_1/send-verification-intents");
  expect(init?.method).toBe("POST"); expect(init?.credentials).toBe("same-origin");
  expect(new Headers(init?.headers).get("x-csrf-token")).toBe("test_csrf");
});

test("missing CSRF cannot issue a Send verification intent", async () => {
  const fetchImpl = vi.fn(async () => Response.json({}));
  const data = createWalletSponsoredSendData(createSessionApiClient({ origin: "https://app.test", fetchImpl }), () => undefined);
  await expect(data.issueVerificationIntent("persona_1")).rejects.toThrow("wallet_send_csrf_required");
  expect(fetchImpl).not.toHaveBeenCalled();
});

test("verification-required errors must match the Send purpose, persona and provider", () => {
  const definition = { status: 403, code: "verification_required", name: "VerificationRequired", retryable: false };
  const body = { error: { code: "verification_required", message: "Verify", retryable: false,
    details: { purpose: "wallet_send", persona_id: "persona_1", provider_id: "very.web" } } };
  expect(walletSendVerificationRequired(new ApiClientError(definition, body), "persona_1")).toBe(true);
  expect(walletSendVerificationRequired(new ApiClientError(definition, body), "persona_2")).toBe(false);
  expect(walletSendVerificationRequired(new ApiClientError(definition, { error: { ...body.error, details: { ...body.error.details, purpose: "reward_claim" } } }), "persona_1")).toBe(false);
  expect(walletSendVerificationRequired({ status: 403, code: "verification_required", details: body.error.details }, "persona_1")).toBe(false);
});

test("client127 refuses an old success shape without retrying or guessing verification", async () => {
  const record = { object: "wallet_sponsored_send", send_id: "send_1", persona_id: "persona_1", status: "reserved", chain_id: 84532,
    token_address: `0x${"1".repeat(40)}`, sender_address: `0x${"2".repeat(40)}`, recipient_address: `0x${"3".repeat(40)}`,
    amount_atomic: "1000000", transaction_hash: null, authorization: null };
  const fetchImpl = vi.fn(async () => Response.json(record));
  const data = createWalletSponsoredSendData(createSessionApiClient({ origin: "https://app.test", fetchImpl }), () => "csrf");
  await expect(data.read("persona_1")).rejects.toBeInstanceOf(ApiClientResponseValidationError);
  expect(fetchImpl).toHaveBeenCalledOnce();
});

test("only a declared not_found response means no recorded send", async () => {
  const fetchImpl = vi.fn(async () => Response.json({ error: { code: "not_found", message: "No send", retryable: false } }, { status: 404 }));
  const data = createWalletSponsoredSendData(createSessionApiClient({ origin: "https://app.test", fetchImpl }));
  await expect(data.read("persona_1")).resolves.toBeNull();
  expect(fetchImpl).toHaveBeenCalledOnce();
});

test.each([
  { body: "{", error: ApiClientProtocolError },
  { body: JSON.stringify({ error: { code: "unexpected", message: "Unrecognised", retryable: false } }), error: ApiClientUnexpectedError },
])("a malformed or unexpected404 stays unknown ($body)", ({ body, error }) => {
  const fetchImpl = vi.fn(async () => new Response(body, { status: 404, headers: { "content-type": "application/json" } }));
  const data = createWalletSponsoredSendData(createSessionApiClient({ origin: "https://app.test", fetchImpl }));
  return expect(data.read("persona_1")).rejects.toBeInstanceOf(error);
});

test("a Base host reserves its Send on chain 8453", async () => {
  const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 503 }));
  const data = createWalletSponsoredSendData(createSessionApiClient({ origin: "https://app.test", fetchImpl }), () => "csrf", BASE_SPONSORED_SEND);
  expect(data.network).toBe(BASE_SPONSORED_SEND);
  await data.reserve("persona_1", `0x${"3".repeat(40)}`, "1000000", "send_key").catch(() => undefined);
  const [, init] = fetchImpl.mock.calls[0];
  expect(JSON.parse(String(init?.body))).toMatchObject({ chain_id: 8453, amount_atomic: "1000000" });
});
