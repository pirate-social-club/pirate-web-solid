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

The quote boundary is now wired through the immutable
`@pirate/api-client@0.8.0` package:

- `createCommunityPurchaseFundingClient` sends only `community_id` and
  `listing_id`, adding the shared session credentials and CSRF header;
- `CommunityPurchaseFundingQuote` displays only server-returned terms and the
  exact-replay state; and
- a remount restores an unexpired quote without another request, while an
  expired draft offers an explicit refresh action.

Focused tests cover the controller, adapter, and UI behavior.

## Explicit boundaries

- The client package is the separately reviewed immutable
  `@pirate/api-client@0.8.0` intake; no handwritten network call bypasses the
  generated client.
- `begin` remains uncomposed and no wallet transaction or funding effect is
  initiated by this lane.
- This lane is route-neutral: a future listing surface must provide the
  community/listing identities before the component is mounted into product
  navigation. It does not invent a listing route or browser-authored economics.
- The operation/late-claim state machine remains out of scope until the backend
  admission contract is separately authorized.

## Acceptance evidence so far

- focused controller, adapter, and UI tests: 17 passing app tests;
- no deployment, secret, route, or external state change;
- source is based on the merged Solid Doctor `main` baseline.
