import { afterEach, expect, it, vi } from "vitest";
import { makeWorkerRequestDiagnostics, solidRequestDiagnostics } from "./request-diagnostics.ts";
import { makeHnsAuthorityClientV2 } from "./authority-client.ts";
import { hasReservedHnsIngressHeader, HNS_PROFILE_AUTHORITY_DEADLINE_MS } from "./wire.ts";
import { validatedHnsResponseHeaders } from "./transport.ts";

const authority = ["community_app_v1", ["activation-01", 3], "route-binding-01", ["operator_managed_route_v1", "operator-activation-01", 7]] as const;
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it("initializes one instance before concurrent awaits and keeps each request context", async () => {
  let generated = 0;
  const records: Readonly<Record<string, string | number | boolean | null>>[] = [];
  const diagnostics = makeWorkerRequestDiagnostics({
    randomUUID: () => { generated += 1; return "opaque-instance"; },
    log: (record) => { records.push(record); },
  });
  expect(generated).toBe(0);
  const release = Promise.withResolvers<void>();
  const first = diagnostics.run("version", async () => {
    const current = diagnostics.current();
    await release.promise;
    expect(diagnostics.current()).toBe(current);
    current?.emit({ phase: "authority_fetch", outcome: "canceled" });
  });
  await diagnostics.run("version", async () => {
    await Promise.resolve();
    diagnostics.current()?.emit({ phase: "authority_fetch", outcome: "success" });
  });
  release.resolve();
  await first;
  expect(generated).toBe(1);
  expect(records.map((record) => [record.request_sequence, record.first_request_on_instance])).toEqual([[1, true], [2, false], [2, false], [1, true]]);
  expect(diagnostics.current()).toBeUndefined();
});

it("correlates one timed-out fetch and cannot leak credentials or late completion", async () => {
  vi.useFakeTimers();
  const records: Readonly<Record<string, string | number | boolean | null>>[] = [];
  vi.spyOn(console, "info").mockImplementation((_event, record) => { records.push(record); });
  const upstream = Promise.withResolvers<Response>();
  let requestId: string | null = null;
  let calls = 0;
  const client = makeHnsAuthorityClientV2({
    origin: "https://authority.test", accessClientId: "private-client", accessClientSecret: "private-secret",
    gatewayDeploymentReference: "deployment",
    fetchImpl: async (_input, init) => {
      calls += 1;
      requestId = new Headers(init?.headers).get("x-pirate-hns-diagnostic-id");
      return upstream.promise;
    },
  });
  const result = solidRequestDiagnostics.run("version", () => client.resolve("app.root", authority));
  const refused = expect(result).rejects.toMatchObject({ reason: "authority_unavailable" });
  await vi.advanceTimersByTimeAsync(HNS_PROFILE_AUTHORITY_DEADLINE_MS);
  await refused;
  upstream.resolve(new Response("late response"));
  await Promise.resolve();
  expect(calls).toBe(1);
  const fetchRecords = records.filter((record) => record.phase === "authority_fetch");
  expect(fetchRecords).toHaveLength(2);
  expect(fetchRecords[0]).toMatchObject({ outcome: "started", correlation_id: requestId, budget_ms: HNS_PROFILE_AUTHORITY_DEADLINE_MS });
  expect(fetchRecords[1]).toMatchObject({ outcome: "timeout", correlation_id: requestId, cancellation_source: "authority_deadline" });
  expect(typeof fetchRecords[0]?.fetch_start_offset_ms).toBe("number");
  expect(JSON.stringify(records)).not.toMatch(/private-client|private-secret|app\.root|activation-01|late response/);
});

it("rejects public identifier seeding and strips internal response headers", () => {
  const headers = new Headers({ "X-Pirate-Hns-Diagnostic-Id": "public-seed" });
  expect(hasReservedHnsIngressHeader(headers)).toBe(true);
  const response = new Response("ok", { headers });
  expect(validatedHnsResponseHeaders(response, 2).get("x-pirate-hns-diagnostic-id")).toBeNull();
});
