# Song reward sponsorship implementation

This branch integrates the repaired persona-wallet funding boundary and client
0.68.0 into the standalone song sponsor surface. Published song cards in the
community/public feed expose Boost through their action menu. The modal offers
Megapot shared winnings or an admitted ERC-20 bonus, reviews immutable terms,
creates the reward, reauthenticates the assigned persona wallet, and requires
an explicit application-owned transfer approval. The embedded Privy bridge is
hidden and uses direct provider requests; this approval cannot be delegated to
an assumed wallet dialog.

The original Storybook draft is preserved in c527edd. Funding commits 23c2ca4
and 63ccaa6 were imported as fe6ea03 and 3676809. The adapter's repaired receipt
and reconciliation behavior is retained. The obsolete top-up affordance is
removed; no second funding-effect, cancellation, pause or refund-history API is
invented. The external-funder fallback remains disabled under its existing
policy gates. Dance, NFTs, mainnet and Lit are excluded.

## Creation and recovery

The creation journal is keyed by account, persona, community and song. Its Web
Lock serializes the logical operation across tabs before an offer or funding
identity exists. It persists the exact offer request and leg request, including
idempotency keys and reviewed qualification versions, before the first request.
It persists the returned offer before requesting a leg, and the returned leg
and funding-effect identities before constructing the signer. An interrupted
response is replayed with the saved request. New draft values cannot replace a
pending creation, and failed identity persistence cannot expose a signing target.

Creation recovery does not authenticate or broadcast. The funding controller
owns its separate receipt and broadcast guard. The UI renders all five
reconciliation reasons, retains known hashes, explicitly identifies missing
hashes, and distinguishes server confirmation from submission. Support hash
entry only requests observation. No browser reset-and-resend control exists.

The application session and selected persona bound private presentation.
Account changes close the surface; persona changes dispose the wallet session
and remount private status. The public projections use a credential-free client.
Private standing and account-wide credits require the session client and
account checks before and after their reads. Credits are labelled account-wide,
not attributed to a song without evidence.

## Contract and provenance

The canonical design digest was rechecked as
21f34d94c60797a8ae798abd7d269891c3ac722f611118b8b865824bc2fc357b.
The actual starting application dependency was 0.67.0. The adopted 0.68.0 archive
is byte-identical to the API publication artifact and hashes to
1fbcb42833ef240870e36b8100933565f543db9bd39f1c883baceb36758f3370.
Its source identifier is
api-next-contracts@4b2d386b06b381455e6db943476ccad8332167f58368d051f90c777a301625af.

The runtime gate retains all prior entries and now covers 57 operations,
including the reward reads, creation, funding, standing and credits. Its digest
is d1a8b1f697c55c6da69b746931b674bca7c2074421c7d64f90a7e3ad3317c375.
Changing the admitted-assets success status in a temporary client copy is
rejected. The installed client was not modified. The provenance check now also
checks its declared required scope rather than leaving expectedScope unused.

Megapot sends its selected activities explicitly, defaults the UI to Study or
singing, and preserves its additional 70–100 percent score floor. An ERC-20
bonus sends no activities or score floor. Both review the server policy and
send its versions as creation preconditions. Karaoke disclosure includes
coverage, score, line count and applicable playback kinds. Token quantities
use exact integer arithmetic and reject excess decimal precision.

## Verification

The full API suite passed 220 tests in 33 files. The full application suite
passed 574 tests in 74 files before two additional sponsor interaction cases;
the final focused sponsor suite passes 15 tests, including both reward kinds
and application-account changes. Typecheck and lint pass; lint reports advisory
warnings, including parser-boundary warnings in the new code. Production
dependency audit found no vulnerabilities across 283 packages.

Worker and Storybook builds pass. The local API-unavailable hydration check
passes with a CSP nonce, hydrated controls, sign-in surface and honest unavailable
state. Missing local HNS secrets are reported by the preview environment; no
secrets were provisioned. The workspace script check reports no findings.

A browser check against the built Storybook followed the song action menu,
reviewed Megapot terms, completed fixture email authorization, inspected the
explicit transaction approval, and reached the fixture server's confirmed
state. Closing and reopening resumed the same confirmed reward. There were no
browser errors. The date input was set through its native value/input/change
interface because the automation CLI's fill command did not populate the
segmented date control. This is controlled fixture evidence, not a live wallet
transaction. The Storybook development preview failed to load during inspection;
the built static Storybook was used successfully.

The interactive story is Flows/Rewards/Functional boost, Song menu to funding.
It uses any fixture email and code 123456, with no network or real signing.
Its journal survives modal closure within the story; the fixture server and
journal are reset by a full page reload. Production uses browser localStorage
and Web Locks instead.

## Remaining acceptance boundaries

This implements a first reward on a song and resumes that saved creation. It is
not yet the complete task closeout. The public projections expose offer IDs but
not original start/end terms or offers that have no leg. Additional sponsorship
of an existing offer and account/server-side discovery of an orphan offer still
need an authoritative read contract. This form blocks that path rather than
fabricating a time window or creating a second nonterminal offer. The creation
journal is intentionally retained after confirmation; it has no operation
rotation or history selector yet.

The public owner-policy read exposes derivative-video permissions, not reward
permission. The authenticated management read contains reward policy but is
owner-scoped. Sponsor-readable reward eligibility remains a contract mapping
follow-up; creation still enforces current owner policy on the server. A missing
or inaccessible policy must not be interpreted as permission by the UI.

Email reauthentication is wired. Other wallet authentication methods exposed
by the adapter are not yet wired into this modal. The entry point is on actual
published song feed cards, not the home video player's overflow; the video feed
does not currently supply a canonical source-song reward target. Full browser
fault-injection acceptance for every reconciliation reason across reload is
still required beyond the adapter regressions and component rendering tests.

No remote publication, deployment, funded staging ceremony or production
activation was performed. A live ceremony requires explicit transaction scope,
assigned participant/sponsor wallets, limits, and independent reconciliation.

## Bounty presentation checkpoint, 2026-09-08

The approved Create a bounty presentation is preserved separately from the
functional sponsor dialog. Its Storybook compose callbacks are no-ops; these
stories do not exercise API creation or funding. The functional dialog already
loads admitted assets, submits reviewed qualification-policy versions, and has
a published-song feed caller. Connecting the approved presentation to that
controller remains required. Existing-offer discovery remains the API follow-up;
public pool and bonus projections do not supply the original offer dates or
an offer that has no leg.

The rewrite's three lint errors were corrected. Radio IDs now use Solid's
hydration-safe allocator, and a controlled interaction test covers arrow-key
selection, focus, wrapping, clicks and the single tab stop. Megapot copy no
longer promises one ticket or same-day qualification; immutable terms are
identified as locking at creation. The story documentation retains the
additional Megapot score-floor requirement instead of claiming it was removed.

Typecheck, lint and Storybook build passed. API tests passed all 220 cases.
The app run passed 541 tests in 68 files but failed with seven worker-start
errors: "Timeout waiting for worker to respond". Retrying those files together
with all rewards tests using one worker passed 55 tests in 11 files. This is
partitioned verification, not a clean full-suite invocation. No new live browser
or funded testnet ceremony was run for this presentation checkpoint. The scratch
shot.mjs file was neither deleted nor included.

## Contract refresh onto Solid main, 2026-09-16

The branch was rebased from 2599268 onto Solid main
99e193b3e960783052eafb6bfb8679441b0d9a79. The rebase dropped the branch's
September 8 merge of then-main after verifying it clean: the merge result
matched each parent for the other side's files. Four shared-file conflicts
recurred at each replayed commit and were resolved for current main.
package.json and bun.lock keep the immutable 0.81.0 client pin, the provenance
record keeps the 0.81.0 artifact, and the runtime-table script keeps the 0.81.0
tables. public-feed.tsx keeps main's imports and session composition and adds
the reward action import; vitest.app.config.ts keeps main's worker bound and
adds the rewards suites. The 0.68.0 and 0.69.0 client archives remain as vendor
history; no dependency resolves to them.

The 0.69.0 sponsor-context read does not exist in the 0.81.0 contracts. The
refresh composes the context from the authenticated, owner-scoped owner-policy
read and the public megapot-pool and asset-bonus projections. The policy yields
the third-party-reward and pool-leg permissions; the projections yield an
existing offer identity. A policy the account cannot read stays unconfirmed and
does not pre-block an attempt: creation remains server-authoritative. Offer
start and end dates are never fabricated, and the UI no longer claims when an
unknown existing offer ends. This supersedes the existing-offer limitation in
the sections above: adding to an offer that has a public leg projection now
reuses that offer, including a zero-leg offer that the local creation journal
already recorded.

A junction resolved in the creation journal: `RecordV1.offer` may be null
exactly when an existing offer identity is present. Replay opens an offer only
when the record has no offer identity; a record with neither fails closed as
corrupt. Creation recovery still adds the pending leg without signing or
broadcasting.

Generated-client coverage. The runtime table now covers 70 operations: main's
56 unchanged entries plus the fourteen consumed reward operations, including
the owner-policy read. The 0.81.0 runtime-table digest is
024f243888852f35b3a09b9d7588824c85dd8ba0fbd7784adc7cc5a015e97e5f. The provenance
scope must contain every expected operation. Mutating the admitted
post_communitiesCommunityIdPostsPostIdRewardOffers success status in a temporary
installed-client copy made the gate report
9af90523299dd8f04b59d8e157742540eaf22ef948ffe39807f640ca88b51183 and exit 1;
restoring the client returned the gate to green, and the installed client was
not left modified.

Verification on the refreshed tree: `bun run tsc --noEmit -p tsconfig.json`
passes; the full API suite passes 243 tests in 35 files; the focused app reward
suites pass 27 tests in four files; the SSR suite passes 20 tests in three
files; `bun run check:test-discovery` owns 193 files; the runtime-table and
provenance checks pass; `bun run lint` exits 0 with advisory warnings and story
parity over 44 stories. The full application suite, Worker build, Storybook
build, dependency audit and the full `bun run verify` command are not rerun in
this refresh and remain scheduled through the coordinator. Browser fixtures were
not rerun; the funding controller and recovery modules are unchanged from the
repair checkpoint, and their reload, refusal and uncertain-submission cases
remain covered by the earlier browser evidence and the current unit and DOM
suites.

Lint repairs in the refresh: two bare `text-destructive` tokens in the bump
sheet became `text-destructive-text`, and the shared reward fixture was renamed
to `reward-sponsor.fixtures.ts` so the story-parity fixture convention accepts
the functional story without adding an allowlist entry.

No remote publication, deployment, merge or live funding was performed by the
refresh. A funded ceremony still requires a deployed candidate, an active
Megapot attestation, an admitted bonus asset, funded persona wallets and
explicit owner authorization.
