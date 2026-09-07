# Named community owner setup

The form renders immediately with Community and Your profile here sections.
Fresh profiles are the default; Public name accepts ordinary names with spaces.
It does not reserve an HNS handle. Existing named, unbound profiles are a
secondary choice and become permanently linked when the community is created.

The first commit reserves a private profile and wallet index. No community row
or public href exists until proof-verified activation succeeds and a second
revision-aware commit publishes it. The saved intent URL survives interruption.
Starting a new setup reclaims a never-bound unfinished creation profile, cancels
the earlier intent, and keeps its HD index. Retired indices are never recycled.

The existing authentication boundary clears provider credentials immediately
after sign-in; Pirate's cookie cannot itself prove an embedded wallet. A pending
setup therefore asks for identity confirmation when that proof is unavailable.
The dedicated /personas/wallets/evm/pending endpoint preserves the existing
profiles response for previously shipped clients. Confirmation activates
private pending profiles before clearing the provider
client. An already active owner requires no confirmation. Dismissal cancels the
prompt's publication continuation; unrelated later sign-ins only recover the
profile. OAuth returns to the saved intent for explicit completion.

Feature-branch verification on September 7: 531 application tests, 140 API tests, and 16 focused
model tests passed. TypeScript, design-system typecheck, lint (existing warnings),
client provenance/runtime table checks, and the Worker build passed. Ten rendered
Storybook variants passed interactions and axe with no violations; ten incomplete
axe checks remain reported separately. Browser checks verified immediate SSR,
hydration, stable account failure feedback, a bound first profile, private setup,
prompt dismissal and explicit resumed publication. The browser uses API fixtures;
provider confirmation and exact wallet-index proof have separate API coverage.
No real wallet or public community was created as a test.

The client artifact comes from api-next c18cbd55ee5f099f135a31f3e91b63482ddab093
(PR 307), with SHA-256 b440c060641224f99898b97c37f36505f17ae9fb56cf15f3d79b18b20d74a927.
The new pending inventory is independent of the active profile read: failure of
that read does not prevent confirmation from recovering a private pending owner.

The owner corrected the migration reservation: community owner activation
uses the next free 0129, with no dependency on the unlanded participation lane.
The SQL and client artifact are unchanged. Release the compatible API first,
then this frontend; never introduce a migration-ledger gap. The task record
owns live release receipts. A production candidate must retain the serving
frontend lineage so unrelated unreleased video work is not included.

The scoped production candidate applies only this feature to serving source
613df46ebfb21a71edae44f2d45d5d490d64cc55. Cherry-pick conflicts were confined
to client metadata, lockfile and the runtime-table audit; runtime files applied
without conflicts. The production Wrangler configuration, HNS ingress source
and post/video runtime source are unchanged from that serving base.

The 0.62.0 to 0.66.0 audit covers the same 34 consumed operations. Seven media
submission responses add only membership_required and
provider_submission_unconfirmed reason codes. Two public-post canonical
responses add unavailable playback/thumbnail variants. All other audited
responses, success statuses and error definitions are unchanged. The new
reviewed digest is 0bb76bd48b7ed7c05c7129cefc8bceef31a1cc4eca8081c2a5ac1d90bcbbc755.
The pending-wallet endpoint is additive and the creation change is tested
through the generated client. No schema check was removed or bypassed.

The scoped candidate's full verify chain passes: 136 API tests, 454 application
tests, 420 design-system tests, both type checks, lint, e2e inventory, production
configuration, provenance/runtime tables, icon checks and Solid Doctor with
zero errors and existing warnings. Production build, generated-config deploy
dry run, SSR/hydration and private owner-setup browser fixtures also pass.
Live activation receipts remain in the workspace task register.
