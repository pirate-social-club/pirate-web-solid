import { ApiClientError, type GetMeAgeVerificationResponse } from "@pirate/api-client";
import { expect, test, vi } from "vitest";
import {
  ageDocumentRequirement,
  verifyAdultViewing,
  type AgeVerificationDependencies,
} from "./age-verification.ts";

const pending: GetMeAgeVerificationResponse = {
  version: "account-age-verification-v1",
  minimum_age: 18,
  status: "verification_required",
  requirement_hash: "a".repeat(64),
  ceremony_intent_id: "server-child",
  generation: 2,
  provider_id: "zkpassport",
  accepted_provider_ids: ["self.pass", "zkpassport"],
};
function client(account: () => string = () => "user-a") {
  return {
    // SAFETY: this focused fixture models only the account id read by this continuation.
    get_usersMe: vi.fn(async () => ({ id: account() }) as never),
    get_meAgeVerification: vi.fn(async () => pending),
  };
}
test("age projection preserves both server choices and has no membership, document or target fields", () => {
  expect(ageDocumentRequirement(pending)).toEqual({
    kind: "pending",
    requirement: "age_18",
    requirementHash: "a".repeat(64),
    intentId: "server-child",
    generation: 2,
    providerId: "zkpassport",
    acceptedProviderIds: ["self.pass", "zkpassport"],
  });
  expect(
    ageDocumentRequirement({
      version: "account-age-verification-v1",
      minimum_age: 18,
      status: "verified",
    }),
  ).toEqual({ kind: "satisfied" });
  expect(() =>
    ageDocumentRequirement({
      version: "account-age-verification-v1",
      minimum_age: 18,
      status: "unavailable",
    }),
  ).toThrow();
});
test("every modal read rechecks the same account and only server authority satisfies it", async () => {
  const api = client();
  const off = vi.fn();
  const verify: NonNullable<AgeVerificationDependencies["verify"]> = async (request) => {
    expect(await request.load(request.signal)).toMatchObject({
      kind: "pending",
      requirement: "age_18",
    });
    api.get_meAgeVerification.mockResolvedValueOnce({
      version: "account-age-verification-v1",
      minimum_age: 18,
      status: "verified",
    });
    return (await request.load(request.signal)).kind === "satisfied";
  };
  expect(
    await verifyAdultViewing(new AbortController().signal, {
      client: api,
      verify,
      subscribe: () => off,
    }),
  ).toBe(true);
  expect(api.get_usersMe).toHaveBeenCalledTimes(3);
  expect(off).toHaveBeenCalledOnce();
});
test("account switching aborts the ceremony instead of consuming another account's capability", async () => {
  let account = "user-a";
  const api = client(() => account);
  expect(
    await verifyAdultViewing(new AbortController().signal, {
      client: api,
      subscribe: () => () => {},
      verify: async (request) => {
        account = "user-b";
        await expect(request.load(request.signal)).rejects.toThrow();
        expect(request.signal.aborted).toBe(true);
        return true;
      },
    }),
  ).toBe(false);
  expect(api.get_meAgeVerification).not.toHaveBeenCalled();
});
test("sign-in dismissal and an already-aborted route never start a document ceremony", async () => {
  const verify = vi.fn();
  const api = client();
  api.get_usersMe.mockRejectedValue(
    new ApiClientError(
      { status: 401, code: "auth_error", name: "AuthError", retryable: false },
      { error: { code: "auth_error", message: "Sign in", retryable: false } },
    ),
  );
  expect(
    await verifyAdultViewing(new AbortController().signal, {
      client: api,
      verify,
      signIn: async () => false,
    }),
  ).toBe(false);
  const controller = new AbortController();
  controller.abort();
  expect(await verifyAdultViewing(controller.signal, { client: api, verify })).toBe(false);
  expect(verify).not.toHaveBeenCalled();
});
test("session refresh cancels an active prompt and a late positive result grants nothing", async () => {
  const api = client();
  let refresh = () => {};
  expect(
    await verifyAdultViewing(new AbortController().signal, {
      client: api,
      subscribe: (listener) => {
        refresh = listener;
        return () => {};
      },
      verify: async (request) => {
        refresh();
        expect(request.signal.aborted).toBe(true);
        return true;
      },
    }),
  ).toBe(false);
});
