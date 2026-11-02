import { expect, test, vi } from "vitest";
import { createSessionApiClient } from "../../api/client.ts";
import { readRewardQualificationPolicies } from "./reward-qualification-policies.ts";

test("the accepted generated client reads disabled capability through the authenticated same-origin proxy without policy traffic", async () => {
  const transport = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ enabled: false }));
  const client = createSessionApiClient({ origin: location.origin, fetchImpl: transport });
  const signal = new AbortController().signal;
  await expect(readRewardQualificationPolicies(client, signal)).resolves.toBeUndefined();
  expect(transport).toHaveBeenCalledOnce();
  const [input, init] = transport.mock.calls[0]!;
  const url = new URL(String(input));
  expect(url.origin).toBe(location.origin);
  expect(url.pathname).toBe("/api/rewards/availability");
  expect(init?.credentials).toBe("same-origin");
  expect(init?.signal).toBe(signal);
});

test("an enabled provider outage remains a typed failure and can recover on the next read", async () => {
  let unavailable = true;
  const policies = { policies: [{ activity: "study", policy: {
    kind: "study_session_first_pass_v2", qualification_policy_version_id: "study-v2", required_correct_bps: 7000,
  } }] };
  const transport = vi.fn(async (input: RequestInfo | URL) => {
    if (new URL(String(input)).pathname === "/api/rewards/availability") return Response.json({ enabled: true });
    return unavailable
      ? Response.json({ error: { code: "provider_unavailable", message: "Unavailable", retryable: true } }, { status: 502 })
      : Response.json(policies);
  });
  const client = createSessionApiClient({ origin: location.origin, fetchImpl: transport });
  const signal = new AbortController().signal;
  await expect(readRewardQualificationPolicies(client, signal)).rejects.toMatchObject({ status: 502, code: "provider_unavailable" });
  unavailable = false;
  await expect(readRewardQualificationPolicies(client, signal)).resolves.toEqual(policies);
  expect(transport.mock.calls.map(([input]) => new URL(String(input)).pathname)).toEqual([
    "/api/rewards/availability", "/api/rewards/qualification-policies",
    "/api/rewards/availability", "/api/rewards/qualification-policies",
  ]);
});
