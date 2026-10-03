# Solid Home video outcome source verification

Prepared for coordinator review on 2026-10-03T10:07:56.716467+00:00.
The source worker leaves an uncommitted reviewable diff on
`fix/video-outcome-toast`, admitted base
`7cdf1838e4939c70aa381d10ee773070bbe601f1`. HEAD and the index remain unchanged.
All installs, edits, checks and builds ran in this assigned worktree. The
coordinator owns preservation, task-record updates and successor integration
following the selected frontend release's acceptance and custody handback.

Home uses the generated browser-session-only `POST /video-outcomes/claim`
operation with exactly `{}`, same-origin credentials and the existing CSRF
cookie/header transport. The current resolved account, session generation,
and shared account-check pending flag fence replies. A newly mounted Home
cannot claim against authenticated chrome retained during a pending check.
Pending, anonymous, failed and SSR paths stay public and do not claim.

Only a winning permanent display permission can show a notice. The document's
in-memory submission-ID set consumes winning permissions before any display,
including stale winning replies, and guards replay across Home remounts.
This set is not persisted and does not grant permission: the server owns
permanent delivery across clients, crashes, lost replies and reinstalls.
There is no polling, recovery retry, release, expiration, reclamation or
mark-seen operation. Errors and losing/null replies remain silent.

Processing failure uses exactly "Your video couldn't be posted." and
"Record again". Policy block uses exactly "Your video wasn't posted because
it didn't meet our guidelines." with no retry action. Both disappear after
8 seconds, without a separate dismiss control; navigation, session changes
and disposal clear timers. English, Arabic and Mandarin follow the existing
locale catalogs and generated catalog workflow. The route-scoped notice uses
design-system buttons, colors, spacing and elevation tokens.

Record again navigates through the real Communities destination chooser and
serving composer seam from the admitted base. The URL contains only a fresh
entry marker and, when present, the frozen song's community and post IDs.
The source reader checks the frozen song community. A fresh composer skips
restoration and refuses to overwrite any earlier stored upload. Takes,
excerpts, captions and submission IDs are not carried from the outcome.
The later coordinator steering supersedes the original null-song wording:
a null song opens the normal fresh song picker with no preselection. The
normal song approval, capture and reservation gates remain mandatory; no
songless publication path was added. Newly started uploads keep the base
composer's existing pre-seal transport/storage behavior.

## Reviewed API artifact

API PR 533 merge: `9dac075e5e18ca886014edccfb95b07c17dc9542`.
The contracts, handler, generated client and sealed tarball were read with
`git show` from API common objects at
`c2ce6c3e15c98ad493079c7b143a35ea2da50840`. API source and checkouts stayed
read-only. The tarball was copied only into this worktree's vendor directory.

Artifact: `vendor/api-client/pirate-api-client-0.105.0.tgz`.
SHA256: `12fc7e193c6c373478a563106780220bfbafa7953e98d2eaf348107384c184f2`.
Generated source identifier:
`api-next-contracts@212f8b003df21daaa5f56eeebb9a6dbd52f754dd6cabd46a4063c86f8a68bab3`.
Generated client SHA256:
`7edec98ae41f6647e886bc88adea3304274e0449ca0462bff45d2cb7fd45d49b`.

The package, provenance and lock use the reviewed artifact. All prior required
operations remain recorded, with `post_videoOutcomesClaim` appended and
required by the provenance gate. The 95 existing runtime response/status/error
tables retain digest
`d35b90835891769e1857711d4d1eb3b9d2ada01349e3d567e359c3e43328ac7b`.
The lock diff changes only the API-client artifact and its integrity hash.
No other dependency version changed. Bun's cache remains under ignored
`node_modules/.cache/bun`.

## Verification

Final stable source passes 1,372 app tests in 141 files, 322 API/session/CSRF
and Worker tests in 42 files, 36 SSR tests in 9 files, 420 design-system tests
in 73 files and 4 locale tests. The 41 focused final Home/Communities tests,
102 composer tests and 10 claim-transport tests also passed as focused runs.
These are overlapping subsets of the full suites, not additional coverage
counts. E2E discovery lists 58 tests without launching a browser; its helper
suite passes 33 tests, and ingress identity passes 24 tests.

The behavior tests execute real Solid2 effects and the real fresh-composer
navigation. They cover pending retained account chrome, account changes,
refresh invalidation, late/replayed winning replies, concurrent losers,
server-permanent lost responses and crash-before-display across fresh client
mounts without client persistence, exact copy/actions, auto-dismiss and timer
disposal. The null-song test cannot capture or upload before choosing and
approving a song, then publishes through the normal song-reference path.
The frozen-song test starts a default excerpt and refuses to restore or
modify an earlier take. Generated response validation rejects playable,
nonterminal, retryable and acceptance-unknown outcome kinds and inconsistent
permission/payload discriminants. Transport tests prove same-origin session
credentials, exact empty body, CSRF and proxy preservation of Origin/cookies.

All browser-free `verify` stages, Worker build, product/dependency boundary
and Storybook build pass. `bun run verify` was not run as one command because
its final `text-post-check`, `song-post-check` and
`community-feed-hydration-check` stages launch a browser, which this dispatch
prohibits. Browser hydration, visual and phone acceptance remain unverified
here. Lint and Solid Doctor pass with warnings; jsdom reports unsupported
media/canvas/scroll methods, and build reports existing chunk-size warnings.

| Final command | Exit | Local log |
| --- | --- | --- |
| `bun run generate-worker-types` | 0 | `node_modules/.cache/toast-gate-worker-types.log` |
| `bun run test:production-config` | 0 | `node_modules/.cache/toast-gate-production-config.log` |
| `bun run test:hns-ingress-identity` | 0 | `node_modules/.cache/toast-gate-hns-identity.log` |
| `bun run tsc --noEmit -p tsconfig.json` | 0 | `node_modules/.cache/toast-final-typecheck.log` |
| `bun run test:e2e:helpers` | 0 | `node_modules/.cache/toast-gate-e2e-helpers.log` |
| `bun run check:e2e` | 0 | `node_modules/.cache/toast-gate-e2e-discovery.log` |
| `bun run check:test-discovery` | 0 | `node_modules/.cache/toast-gate-test-discovery.log` |
| `bun run test:api --maxWorkers=1` | 0 | `node_modules/.cache/toast-gate-api.log` |
| `bun run test:app --maxWorkers=1` | 0 | `node_modules/.cache/toast-final-app.log` |
| `bun run test:ssr --maxWorkers=1` | 0 | `node_modules/.cache/toast-gate-ssr.log` |
| `bun run lint` | 0 | `node_modules/.cache/toast-final-lint.log` |
| `node scripts/check-solid-runtime.mjs` | 0 | `node_modules/.cache/toast-gate-solid-runtime.log` |
| `node scripts/check-api-client-provenance.mjs` | 0 | `node_modules/.cache/toast-gate-provenance.log` |
| `node scripts/check-api-client-runtime-tables.mjs` | 0 | `node_modules/.cache/toast-gate-runtime-tables.log` |
| `bun run check:web3-icons` | 0 | `node_modules/.cache/toast-gate-web3-icons.log` |
| `bun run check:phosphor-icons` | 0 | `node_modules/.cache/toast-gate-phosphor-icons.log` |
| `bun run --cwd packages/solid-ui typecheck` | 0 | `node_modules/.cache/toast-gate-ui-typecheck.log` |
| `bun run --cwd packages/solid-ui test --maxWorkers=1` | 0 | `node_modules/.cache/toast-gate-ui-tests.log` |
| `bun run check:solid-doctor` | 0 | `node_modules/.cache/toast-gate-solid-doctor.log` |
| `bun test src/locales/index.test.ts` | 0 | `node_modules/.cache/toast-gate-locale.log` |
| `bun run build` | 0 | `node_modules/.cache/toast-gate-build.log` |
| `bun run check-product-graph` | 0 | `node_modules/.cache/toast-gate-product-graph.log` |
| `bun run build-storybook` | 0 | `node_modules/.cache/toast-gate-storybook-build.log` |

The focused logs are `node_modules/.cache/toast-final-focused.log`,
`node_modules/.cache/toast-composer-serial.log`,
`node_modules/.cache/toast-transport-final.log` and
`node_modules/.cache/toast-ssr-focused.log`. Initial and final gate receipts
are `node_modules/.cache/toast-verification-results.json` and
`node_modules/.cache/toast-final-results.json`. Logs remain in the ignored
worktree cache for coordinator inspection.

The required read-only workspace script audit was also run from this worktree:
`bin/script-check --changed` exits 0 with one unrelated advisory finding in
`freedom-browser/src/renderer/pages/scripts/rad-browser.js` (1,251 lines).
The touched provenance checker is 153 lines and has no finding.
The audit is recorded in `node_modules/.cache/toast-script-quality.log`.

## Earlier failures retained

The initial in-sandbox control-root `drive-check` exited 1 because the sandbox
binds that root read-only. It was a false hardware-fault report. The coordinator's
outside-sandbox receipt at
`/home/t42/Documents/agents/archive/video-staging-reconciliation-cleanup-2026-10-03/solid-toast-dispatch-20261003T0915Z/coordinator-drive-check.json`
and matching `.log` verify identity, a read-write mount and a real
create/sync/remove probe at `2026-10-03T09:19:28.979273+00:00`.
The assigned worktree's own tiny create/sync/remove probe also passed; no
canonical-root mutation probe was rerun after the coordinator steering.

Initial Home tests failed on the base route's owned-scope session write;
its projected signal now explicitly permits that Solid2 write. Initial test
assertions were corrected to respect committed Solid2 updates and the
composer's mounted, empty audio element. Initial type errors in new fixtures
and the optional notice signal were fixed. The navigation test's initial
module mock failed lint and was replaced with the real song-reader interface.

The first broader composer run had 7 failures (110 passed), including the
incorrect empty-audio assertion and 6 timing/capture failures while the shared
host's load average exceeded 98. The serial composer rerun passed all 102.
That failed run remains in `node_modules/.cache/toast-composer-focused.log`.
The first full app run had 24 failures (1,348 passed): the source worker added
the pending-session seam while the runner was active, causing old cached
provider exports to mix with updated Home imports. This was a contaminated
run, not an established baseline failure. The final stable full app rerun
passes all 1,372. Its failed log remains `node_modules/.cache/toast-gate-app.log`;
the passing log is `node_modules/.cache/toast-final-app.log`. The initial lint
failure remains `node_modules/.cache/toast-gate-lint.log`, and the passing lint
log is `node_modules/.cache/toast-final-lint.log`.

## Remaining work and practical limits

Permanent accepted loss remains part of v1: a claim committed before a crash
or lost response may never produce a visible notice. The local replay guard
must not be treated as cross-device delivery authority. The client tests model
server-permanent claims; live multi-device behavior is for coordinated API
and phone acceptance. A conflicting pre-seal upload blocks a fresh operation
rather than restoring or overwriting it.

The coordinator must independently review and preserve this exact source diff,
update the authoritative task record, and integrate only after the runtime executor records the selected frontend
acceptance and custody handback. The later API outcome route/schema release and
successor frontend must both be serving before phone notice acceptance.
Browser checks, phone/device acceptance, source integration, publication and
runtime deployment were not performed by this source worker.

## Exact changed files

```text
bun.lock
docs/evidence/solid-video-outcome-toast-source-2026-10-03.md
package.json
scripts/check-api-client-provenance.mjs
src/App.tsx
src/api/video-outcome-claim.test.ts
src/features/community/your-communities-page/your-communities-route.tsx
src/features/posts/post-composer/create-post-dialog.tsx
src/features/posts/post-composer/song-excerpt-composer.tsx
src/features/posts/post-composer/song-excerpt-source.ts
src/features/posts/video-outcomes/claim.ts
src/features/posts/video-outcomes/fresh-composer-entry.ts
src/features/posts/video-outcomes/fresh-composer-navigation.test.tsx
src/features/posts/video-outcomes/home-video-outcome.test.tsx
src/features/posts/video-outcomes/home-video-outcome.tsx
src/features/posts/video-submission/video-composer-runtime.test.tsx
src/features/posts/video-submission/video-composer-runtime.tsx
src/features/shell/application-session.tsx
src/locales/ar/feed.json
src/locales/en/feed.json
src/locales/generated.ts
src/locales/zh/feed.json
src/routes/communities/index.tsx
src/routes/index-ssr.test.tsx
src/routes/index.tsx
vendor/api-client-provenance.json
vendor/api-client/pirate-api-client-0.105.0.tgz
vitest.app.config.ts
vitest.ssr.config.ts
```

## Content hashes for review

The evidence document itself is omitted from this hash table to avoid a
self-reference. Every other intended changed file is included.

| File | SHA256 |
| --- | --- |
| `bun.lock` | `7afd87dfdd4b6fc44cbf4e4fcd6e7b1d1eaee021cf28645211e0cea288f5529a` |
| `package.json` | `233666abad247af564029a20898faa3639bd0fb2489d7c5977d9d173c4a7e0e0` |
| `scripts/check-api-client-provenance.mjs` | `9f77c8ee6ccec3bc3352aab0407f6d472f8661fc270a847d044730cc35322aa7` |
| `src/App.tsx` | `27cc8f8317953b1f20c1a49d9bd70cb08d7a67011d0b2ec375f5ee28928ca620` |
| `src/api/video-outcome-claim.test.ts` | `74d8a964dd13fe7ec1b62a701739e5ac86526fcc8a188ee98c39fb84d00c88d5` |
| `src/features/community/your-communities-page/your-communities-route.tsx` | `beac67221fdd1371ab760f8649f12d57783f725313fa04b06e44d6e50d1e74b0` |
| `src/features/posts/post-composer/create-post-dialog.tsx` | `326751055e2b709260443855686179cf8b0151b65090ca908f3305dad08e3b1d` |
| `src/features/posts/post-composer/song-excerpt-composer.tsx` | `0bfe4419c30054dfab7fc36706576e370b42b1dccc15d1103063d4279b5a76d4` |
| `src/features/posts/post-composer/song-excerpt-source.ts` | `9729eca3f2e74154160c51df7342bf7e243df5c96d7ebd8dae2394b55b1e5dfc` |
| `src/features/posts/video-outcomes/claim.ts` | `67af09664ab9267bc6663cc3a4fdd572cb874f7e66703a34d19823340ec418cb` |
| `src/features/posts/video-outcomes/fresh-composer-entry.ts` | `4642eebeb22d43d1649c21403aa7714941f2b5c1078caa037cb2d9ec1c1e9db3` |
| `src/features/posts/video-outcomes/fresh-composer-navigation.test.tsx` | `a3e7ca23817971e3838d41a4ed576180a889f3b158167a31eeb3de4df7484746` |
| `src/features/posts/video-outcomes/home-video-outcome.test.tsx` | `d953265873ea0640837085368c136f9d76e1711939f2d0ffe0b713d9150fb4f0` |
| `src/features/posts/video-outcomes/home-video-outcome.tsx` | `8890cf0688f0902557a1c54839f74ffb6a7eeaa77a2ddb4f543dbb3a82ea2898` |
| `src/features/posts/video-submission/video-composer-runtime.test.tsx` | `36455d1eca4f17985a5d95d2240c0f66940fb03e5252957407e84f97499b3dbc` |
| `src/features/posts/video-submission/video-composer-runtime.tsx` | `208fa265c03289108fbfb4440532141bcf9988c981f96e7b3cebc3e65fe6c745` |
| `src/features/shell/application-session.tsx` | `31630b3c795da57cb09a7b919a20f59eeba44bcc7eefad474de6a0602d8783f6` |
| `src/locales/ar/feed.json` | `8e938838d0a8f15e3ad9779c8d8a80e1c08b0fa984f45a18fde36e97ea28cd4b` |
| `src/locales/en/feed.json` | `6fd391ddb7bfc4613e05ba8464d63cb1a34cc90c30463bb36dcf751c202e58b2` |
| `src/locales/generated.ts` | `4b4ce94ef4cc89aae8c2531974bffb25d5bee4f5ac162c0de8e67f56fbcb2802` |
| `src/locales/zh/feed.json` | `79243a3f1512dc8447e651db3c992325472174c5dd50fca519707e10e6e161da` |
| `src/routes/communities/index.tsx` | `c0345064677eb3641b9742a87ea1773196c8747b4ea4d59698150a935f879163` |
| `src/routes/index-ssr.test.tsx` | `e165dee8ddab620c8adc0bc85fd5d8933117730b751aacebd50d3d5341ff97b1` |
| `src/routes/index.tsx` | `9bef10a08f3fb00498e8f17cff9210e38948059021ea818302c830774ee9ab80` |
| `vendor/api-client-provenance.json` | `709df7bd1978d4f3a5b16e342b8cb972a4d9c53bade1e86538a6adcdbf5b9207` |
| `vendor/api-client/pirate-api-client-0.105.0.tgz` | `12fc7e193c6c373478a563106780220bfbafa7953e98d2eaf348107384c184f2` |
| `vitest.app.config.ts` | `5cd70d9db1228cc8e4df83c5c114f5f6549436c453d70ae964dc13da66e2bdac` |
| `vitest.ssr.config.ts` | `20f42cd6d692a9808782443cd5a17a3e6c941758a5188c2609fd7451f4fee1ef` |

## Coordinator review and local browser verification

The source worker returned custody and exited. The coordinator independently
read the implementation, verified all 28 source hashes above, and inspected
the real claim transport, session fencing and fresh composer flow. The sole
receiving frontend release and phone coordinator is the runtime executor in
thread 01a0faff-7453-7a12-8423-5d11f2a210ed. The XState pilot remains separate.

The coordinator ran all three local browser stages from this worktree with
fixture APIs and isolated Playwright contexts. Song posting passed its lyrics,
instrumental and published-navigation scenarios. Community feed hydration
passed ready, empty, recovered and failed scenarios with zero hydration errors.
The text posting rerun passed published, manual-review, blocked, typed-conflict
and byte-identical lost-response replay. Logs are
node_modules/.cache/toast-parent-song-browser.log,
node_modules/.cache/toast-parent-hydration-browser.log and
node_modules/.cache/toast-parent-text-browser-recheck.log.

The first text browser run failed at the final lost-response scenario with
"Hydrated Community has no posting action: Community posts are temporarily
unavailable." Its log remains toast-parent-text-browser.log. An unchanged
source rerun passed; this does not establish the cause of that first failure.
All stages of verify have passing individual executions, with unit suites
limited to one worker. The combined verify command was not run. Local browser
checks do not prove staging phone behavior. Source publication, deployment,
joint API/toast device acceptance and production remain open.
