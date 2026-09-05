import { AsyncLocalStorage } from "node:async_hooks";

export const HNS_DIAGNOSTIC_ID_HEADER = "x-pirate-hns-diagnostic-id" as const;
type AuthorityOutcome = "success" | "failed" | "timeout" | "canceled";
type DiagnosticFields = Readonly<{
  phase: "request_entry" | "authority_fetch";
  outcome?: "started" | AuthorityOutcome;
  correlation_id?: string;
  authority_kind?: "community_app_v1" | "handle_persona_v1";
  budget_ms?: number;
  fetch_start_offset_ms?: number;
  elapsed_ms?: number;
  cancellation_source?: "authority_deadline" | "caller" | "none";
}>;
type RequestDiagnostic = Readonly<{
  started_at: number;
  emit: (fields: DiagnosticFields) => void;
}>;

export function makeWorkerRequestDiagnostics(options: {
  readonly randomUUID?: () => string;
  readonly now?: () => number;
  readonly log?: (record: Readonly<Record<string, string | number | boolean | null>>) => void;
} = {}) {
  const storage = new AsyncLocalStorage<RequestDiagnostic>();
  const now = options.now ?? (() => performance.now());
  const randomUUID = options.randomUUID ?? (() => crypto.randomUUID());
  const log = options.log ?? ((record) => console.info("worker.diagnostic", record));
  let instanceId: string | undefined;
  let sequence = 0;
  return {
    current: () => storage.getStore(),
    run<A>(version: string | null, use: () => A): A {
      const startedAt = now();
      // Workers disallow randomness at module evaluation. Initialize before the
      // first request's first await; this is an instance proxy, not startup time.
      instanceId ??= randomUUID();
      const requestSequence = ++sequence;
      const identity = Object.freeze({
        instance_id: instanceId, request_sequence: requestSequence,
        first_request_on_instance: requestSequence === 1,
        worker_version: version, worker_role: "solid",
      });
      const emit = (fields: DiagnosticFields): void => {
        try { log({ ...identity, ...fields, request_offset_ms: Math.max(0, now() - startedAt) }); }
        catch { /* Diagnostics cannot change admission. */ }
      };
      return storage.run({ started_at: startedAt, emit }, () => {
        emit({ phase: "request_entry" });
        return use();
      });
    },
  };
}

export const solidRequestDiagnostics = makeWorkerRequestDiagnostics();

export function beginAuthorityDiagnostic(
  kind: "community_app_v1" | "handle_persona_v1",
  budgetMs: number,
) {
  // No inbound request value participates in this identifier.
  const correlationId = crypto.randomUUID();
  const current = solidRequestDiagnostics.current();
  const startedAt = performance.now();
  const fields = {
    phase: "authority_fetch" as const,
    correlation_id: correlationId,
    authority_kind: kind,
    budget_ms: budgetMs,
    fetch_start_offset_ms: Math.max(0, startedAt - (current?.started_at ?? startedAt)),
  };
  current?.emit({ ...fields, outcome: "started" });
  return {
    correlationId,
    finish(outcome: AuthorityOutcome): void {
      current?.emit({
        ...fields, outcome, elapsed_ms: Math.max(0, performance.now() - startedAt),
        cancellation_source: outcome === "timeout" ? "authority_deadline" : outcome === "canceled" ? "caller" : "none",
      });
    },
  };
}
