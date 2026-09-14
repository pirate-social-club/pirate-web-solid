# Community creation release coverage

The release behavior is pinned to Solid `b7850cb71232810be22c27284cc4ae7d83116cc3`
and the contract-compatible API release. This test-only branch adds no
application behavior or API dependency change.

The route-view suite owns deterministic controller behavior. It covers
existing and new persona selection, saved-intent resume, create, update and
commit failures, lifecycle and remote-draft revision conflicts, lost update
responses, quota and expiry terminals, account changes during creation,
activation, reload and already-committed discovery. Those cases use the real
controller with narrow API, session, identity-confirmation and navigation
seams.

The loopback Playwright suite owns browser integration without provider
mutation. It drives the built Worker, intercepts every API request, proves a
rejected create can be retried with the same idempotency key, completes owner
activation and reopens the saved intent without a duplicate creation.

The required staging Playwright suite owns the deployed contract proof. It
fails closed before browser launch unless the staging-or-loopback origin,
mutation flag and test credentials are present. Through the real UI and API it
creates exactly one persistent community, then proves the committed intent,
owner persona binding, owner role and moderation capability, membership and
posting capability, automatic following, reload retention, management route
and mutation-free intent reopening. It uses read-only API requests for
post-creation assertions and records no credential, cookie, token or response
body.

The live suite is the only part of this map that requires the coordinated
staging window. A passing hosted or local discovery run does not substitute for
the credentialed staging result.
