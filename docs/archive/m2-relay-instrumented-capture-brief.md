# M2 relay 500: instrumented staging capture brief

Status: **ready for an authorized staging window; no deployment performed**

Date: 2026-08-14

## Objective

Identify the exact failing stage inside Pirate's `/api/privy-relay` wrapper.
The existing React/Core differential proves both callers receive the same
retryable HTTP 500 while the equivalent signed request sent directly to
Privy's Wallet API succeeds. The remaining question is the wrapper exception
or upstream-response mapping, not Solid/React parity.

## Safety and ownership preconditions

`pirate-api-staging` is a shared mutable fixture. Before any deploy:

1. Read the API staging ownership runbook and inspect its active hold.
2. Do not deploy while another hold is active. The current ledger records an
   active rewards hold; this brief therefore authorizes no deploy today.
3. If the hold is explicitly released, add a new ledger entry before deploy
   containing only role identifier `workspace_owner`, the exact worktree SHA,
   UTC start time, expected end time, and this measurement objective.
4. Deploy through the API package's stamped staging command, never direct
   `wrangler deploy`.
5. Confirm `https://api-staging.pirate.sc/__version` reports the intended SHA
   immediately before replay and again when evidence is recorded. Release the
   hold afterward and record the SHA left on staging.

No production deploy, production write, or funded wallet path is in scope.

## Instrumentation

Add temporary structured logs around the relay handler and its downstream
stages. Log only safe metadata:

- correlation/request ID;
- stage (`validate`, `resolve_wallet`, `privy_request`, `privy_response`,
  `finalize`, `response`);
- HTTP status and stable error code;
- wallet/intent identifiers only in hashed or redacted form;
- elapsed milliseconds.

Never log bearer tokens, authorization signatures, private keys, request bodies,
or wallet secrets. Preserve the existing retryable error contract in responses.
Remove the diagnostic logging in the same change that fixes the defect, or
record a dated removal condition if the staging-only instrumentation is kept.

## Replay procedure

Use a fresh, walletless disposable fixture because prior captures contain
expired signatures and redacted credentials. Authenticate from the known
Privy-allowed browser origin, use an existing valid disposable target profile,
and run one Core JS request through `/api/privy-relay` while a foreground
Wrangler tail captures structured logs. Capture the complete stage sequence and
the sanitized request/response pair. If feasible, replay the equivalent React
request in the same window; this is functional differential evidence, not a
framework benchmark.

The capture is decisive when either:

- a handler stage throws, identifying the API fix lane; or
- Privy returns a response that the wrapper maps incorrectly, identifying the
  response-contract/finalization lane.

If the target fixture or authentication fails before the relay invocation,
stop and record **uncertain**; do not classify the 500 and do not attempt a
sixth fixture indefinitely. Escalate to a new fixture prerequisite or an
instrumented branch with the same staging hold protocol.

## Acceptance

After the focused API fix, replay the captured Core request against staging and
obtain an end-to-end HTTP 200 with the expected relay result. Run only the
touched API route tests, verify the merge-queue result, and record the merged
SHA plus the later deployed SHA separately. Update the differential record and
`solidstart-blocker-status.md`; do not describe this product defect as
migration work.
