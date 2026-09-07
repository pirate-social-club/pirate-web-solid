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

Verification on September 7: 531 application tests, 140 API tests, and 16 focused
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

Production is unchanged. API migration 0130 is reserved behind participation's
0129. That migration has not landed and is outside this UI release scope.
Refresh and verify the compatible API/Solid pair after the dependency lands;
do not deploy this frontend ahead of its API contract or skip a reserved
production migration.
