# M3 reload-safe funding lane

This lane starts from `main`, which already contains the completed Solid
Doctor integration and CI hardening. The first slice is intentionally limited
to durable, non-authentication quote state.

## Landed in this lane

`src/features/community-purchase-funding/funding-draft.ts` provides a small
storage-backed controller that:

- persists only the server-created quote and its two-field intent;
- restores an unexpired quote after a page reload without creating another
  request;
- safely retries when a browser crash happened after the server committed but
  before local persistence (api-next exact replay makes that retry safe);
- rejects malformed, mismatched, oversized, or expired local state; and
- never stores authentication material.

Focused tests cover all of those cases.

## Explicit boundaries

- The client package remains `@pirate/api-client@0.7.0` until a separately
  reviewed `0.8.0` intake and release-ledger entry is authorized.
- No handwritten network call is introduced to bypass the generated client.
- `begin` remains uncomposed and no wallet transaction or funding effect is
  initiated by this lane.
- A later slice must wire the generated quote endpoint, then add the
  operation/late-claim state machine only after the backend admission contract
  is authorized.

## Acceptance evidence so far

- focused controller tests: 3 passing, 11 assertions;
- no deployment, secret, route, or external state change;
- source is based on the merged Solid Doctor `main` baseline.
