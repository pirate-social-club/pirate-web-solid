# Staging end-to-end suite

This suite replaces ad-hoc staging clicks with repeatable Playwright evidence.
It defaults to `https://web-next-staging.pirate.sc`, runs one Chromium worker,
and keeps traces on failure for unauthenticated probes. Authenticated fixtures
use sanitized diagnostics instead. Override the origin with
`E2E_BASE_URL` for an explicitly prepared local preview.

Each checkout needs its own installed dependencies before any test, type or
lint command. From the repository root, using Bun 1.4.0 and Node 24 or newer,
run `bun install --frozen-lockfile --ignore-scripts --network-concurrency=1
--concurrent-scripts=1`. This installs the pinned workspace dependencies
without starting lifecycle scripts. Leave `node_modules` installed for review;
Playwright test discovery and the fake sign-in tests still import Playwright.
Installing dependencies does not launch or install browser binaries.

For local checks, run `bun run test:e2e:helpers`, then `bun run check:e2e`.
The latter includes TypeScript and discovery only. Install Chromium separately
with `bun x playwright install chromium` when preparing an authorized live run.

`bun run test:e2e` and `bun run test:e2e:staging` run only tests tagged
`@staging-readonly`. Authenticated tests read `E2E_PRIVY_EMAIL` and
`E2E_PRIVY_OTP` from the process environment. Credentials must come from an
authorized secret runner or a git-ignored local `.env`; never place them in a
script, source file, commit, trace, or bundle.

The separate `@hns-readonly` diagnostic runs
with `bun x playwright test -c e2e e2e/owner-settings-readonly.spec.ts` through
the approved staging credential runner. It discovers an existing owner
community, checks moderation, names and HNS discovery, and visits namespace
settings twice. Browser API writes are blocked. Missing ownership or disabled
HNS fails explicitly, rather than creating a community or skipping. This is
not complete chain/DNS onboarding acceptance and does not access production.

After a complete staging mainnet import, run `bun run test:e2e:hns-mainnet-route`
with `E2E_HNS_ROOT`, `E2E_HNS_COMMUNITY_ID`, `E2E_HNS_SESSION_ID`, and
`E2E_HNS_COMMUNITY_NAME` set to that run's exact values. Inject the staging
Privy fixed-OTP pair through the authorized secret runner. This read-only test
requires the owner panel to show the verified import and the community route
to load anonymously, after reload, and after a fresh sign-in. It refuses a
different origin or missing fixture values. The chain, DNSSEC, DANE, app host,
claimed host, and unclaimed-host assertions remain separate parts of the full
mainnet acceptance run; this browser smoke does not claim them.

The routine staging HNS serving gate is `bun run check:staging:hns-route`.
It checks the active gateway fingerprint against the built staging Worker,
reads the current safe Handshake mainnet records, validates DNSSEC and DANE
through both staging nameservers, and requires app.8s28 and membertest.8s28
to serve the expected content while an unclaimed host returns 421. It then
runs the browser route test with the staging import owner's fixed-OTP Privy
identity from Infisical. The tunnel closes when the check ends. The guarded
staging deploy command builds from published main, refuses a mismatched
gateway, deploys, and runs the same serving gate immediately afterward.
This check reuses the attached route; a fresh import needs staging cleanup
and a new Bob TXT challenge update.

Feed hydration runs separately with `bun run test:e2e:feed-hydration`. It requires
`E2E_FEED_COMMUNITY_PATH_SEGMENT` and fails, rather than skips, if the fixture is
missing or invalid. The generic read-only smoke command excludes this tag and
does not establish hydration coverage. A designated required hydration job and
a qualified maintained feed fixture are still needed; merely adding this
command does not make it a required hosted check.

Tests tagged `@staging-mutating` are excluded from the default gate and also
skip unless `E2E_ALLOW_MUTATION=1`. Run them explicitly with
`bun run test:e2e:staging:mutating`. The Very scan-boundary test additionally
requires `E2E_VERY_JOIN_COMMUNITY_ID` naming a Very-gated community that the
E2E account has not joined. It creates the proof and bridge sessions, proves
that the pinned widget and QR render, then closes the widget before any palm
scan. A physical palm remains a manual release boundary.

The M1 happy path is excluded from that generic selector and runs only through
the attempt runner. Select the attempt number, identity slot and receipt role
explicitly, for example:
`bun run test:e2e:happy-path:attempt -- --attempt 1 --slot owner --role owner`.
The authorized secret runner must provide the matching fixed-OTP pair under
`MODERATION_E2E_<SLOT>_EMAIL` and `MODERATION_E2E_<SLOT>_OTP`, plus
`E2E_STAGING_PAIR_ID`, `E2E_STAGING_MANIFEST_PATH`,
`E2E_STAGING_MANIFEST_SHA256`, and `E2E_STAGING_PAIR_OBSERVED=1`. Slot names
use letters, digits and underscores; adding a future slot is an environment
change, not a source change. The runner passes only the selected account as
direct `E2E_PRIVY_*` variables, records the explicit slot with the attempt
number and role, and strips operator variables and other unrelated environment
values before the single Playwright invocation. The preflight hashes and reads
the observed manifest, verifies its full five-worker API/Solid pair, 100%
traffic, health readbacks, enabled song playback flag and non-empty playback
R2 binding, and records only a compact manifest digest in the receipt. No
readiness boolean substitutes for those readbacks, and no retry or second
invocation is implicit.

The post-rejection spec uses
`community-very-staging-fixture-acceptance-v1` by default, or
`E2E_VERY_FIXTURE_COMMUNITY_ID` when provided. That fixture has no HNS route
authority by design. Its POST must return the sanitized `404 not_found`
contract, and the client must offer `Discard and edit` without entering a
retry loop.

The text and song posting specs drive the community page's own `Post here`
action, which is the surface a member uses, rather than the global entry with a
raw community identifier. Both read `E2E_COMMUNITY_PATH_SEGMENT`, naming a
staging community this account belongs to with an active persona, and skip with
a visible reason without it. The song spec publishes real audio into the
configured object store and asserts exactly one publication, no lyrics command
for an instrumental, and the post appearing in the feed; it is the only
evidence that the deployed API, storage and processing accept a song, because
the local `song-post-check` supplies its own responses.

The earlier successful post spec skipped with a visible reason until the HNS
lane supplied `E2E_ROUTE_AUTHORIZED_COMMUNITY_ID`. It does not enable HNS and must
never use the Very ceremony fixture. The API currently exposes no post-delete
contract, so an explicit run leaves uniquely marked staging content and
records a cleanup annotation.

The feed hydration spec reads `E2E_FEED_COMMUNITY_PATH_SEGMENT`, naming a
community that both resolves at `/c/<segment>` and whose public feed endpoint
answers, and skips with a visible reason without it. Those are two conditions,
not one: a community can carry public posts, be a valid community id, and still
fail both. On 2026-09-09 the two staging communities with public posts,
`staging-song-pipeline` and `community-very-staging-fixture-moderation-e2e`,
report `route_slug: null` in their preview and 404 on
`/public-communities/<ref>/feed`, so a route alone would not be enough. It asserts that the response body already carries the feed
and that hydration issues no further read of it, which is the one place that
observes serialization and hydration together. It proves nothing until the
change under test is the deployed build.

After one authorized physical scan, run the separately tagged read-only
membership assertion with `E2E_ALLOW_MANUAL_VERIFY=1` and
`bun run test:e2e:staging:manual`. This is once-per-release evidence, not a
per-commit gate.

An authorized staging publish is incomplete until the publisher injects the
staging test-account environment and runs `bun run test:e2e:staging` against
the resulting deployment. Mutating and manual tags are never part of that
automatic post-publish check.

## Required song onboarding journey

`bun run test:e2e:song-onboarding` signs in with an authorized fixed-OTP Privy
identity, registers the Pirate account if necessary, creates its own uniquely
named community, uploads the included instrumental MP3, publishes it, reloads
its community feed and proves playback plus seeking. It does not require a
personal song file or a pre-existing community. It makes no business API mocks.
The dedicated configuration fails before launching a browser if credentials
are missing; it cannot substitute skipped tests for acceptance.

Inject `E2E_PRIVY_EMAIL` and `E2E_PRIVY_OTP` through the authorized secret runner.
The existing operator names `MODERATION_E2E_OWNER_EMAIL` and
`MODERATION_E2E_OWNER_OTP` are also accepted. Do not put their values in commands,
reports or Git. The default target is the known staging app; `E2E_BASE_URL` can
select a prepared localhost origin backed by the real test services. Production
and arbitrary remote origins are refused. Privy itself is still the real test
application, even when the product origin is local.

The explicit command permits one community and one 16-second song, uses no
retries, and has a ten-minute test timeout. It does not reset databases, deploy
workers, provision keys or run unrelated acceptance cases. The test identity
must have community-creation quota. There is no supported delete contract, so
created content remains marked for disposition; a quota failure is a failure,
not grounds to reuse an unrelated community or bypass product checks.

Authenticated fixtures disable traces, screenshots and video and attach only
bounded network method/path/status diagnostics on failure. The auth and
community setup adapt the preserved, unintegrated foundation at
`9dfb77ac0195caecff524f2096ecf6582305302e`; the song flow extends the current
`song-compose.spec.ts`. This instrumental journey does not establish lyric
alignment, retention, ACR registration, moderation or every engagement case.
Those remain separate assertions and must not be claimed from this test.

Creation failure diagnostics retain paired request/response JSON attachments.
They preserve JSON structure, enum values and string constraints for creation
calls, while replacing free text and excluding all headers and credentials.
The observer drains body reads before teardown, and the creation helper waits
for the actual POST response. Raw authenticated traces, video, screenshots and
DOM snapshots remain disabled. Run `node --test scripts/creation-diagnostics.test.mjs`
for redaction and real-browser request/response capture regression tests.
## Required community creation acceptance

`bun run test:e2e:community-creation` runs one creation journey with no retries
and no credential-based skip. Its preflight rejects missing mutation consent,
missing test credentials, malformed OTPs and targets other than the exact
staging origin or a prepared loopback origin before starting a browser. Set
`E2E_ALLOW_MUTATION=1` explicitly and inject the authorized test credentials
through the secret runner. The same checks apply when selecting this spec
through the general Playwright configuration. Listing tests is not acceptance.

The journey creates a uniquely marked community through the UI and api-next,
confirms an active bound persona, membership and owner capabilities, reloads,
opens management through the community menu, then revisits the committed
creation intent. It checks that the resource and revision remain unchanged and
that reopening causes no additional creation writes. It records the created
route as a persistent-content annotation. It does not automatically delete the
community. The target must run the candidate build and the corresponding
api-next contract; a pass on an older deployment does not validate this branch.

Authenticated fixtures share the email-first InputOTP ceremony and disable
raw traces, screenshots, video and DOM error contexts. Failures attach bounded
sanitized network events; creation request and response bodies retain schema
shape and revisions while withholding private values. Other optional probes
retain their existing tags and visible skip behavior.

`bun run test:e2e:helpers` runs the small Node regression suite for sign-in,
preflight and diagnostics, without a browser or a server. It is part of
`verify`. `bun run check:e2e` checks types and lists the browser tests; it does
not execute them. The configured creation command is a separate required
acceptance check, and missing inputs must be reported as a failed check.

## Local creation fixture

`e2e/community-creation-local.spec.ts` carries the former
`scripts/community-owner-activation-check.mjs` scenarios as a maintained
spec: a rejected create keeps the form stable and retryable, a committed
intent stays private until profile activation completes, and resuming the
saved intent publishes once without another create. It intercepts every
`/api/**` call, so it requires a loopback origin serving the built Worker and
skips visibly otherwise. Serve the built Worker on `127.0.0.1:4186` and run:

```sh
E2E_BASE_URL=http://127.0.0.1:4186 bun x playwright test -c e2e --grep @local-fixture
```

The spec is tagged `@local-fixture` and is excluded from the staging greps.

The reviewed import and its verification limits are recorded in
[the browser foundation note](../docs/community-creation-browser-foundation.md).
