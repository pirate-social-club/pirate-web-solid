# Notifications generated-client intake

This document preserves the historical contract-only Solid intake and its
dated successors. The 2026-10-18 section records the actual final 0.122.0 backend
and current-main source binding. Fresh consumer gates/review and paired serving
acceptance remain separate.

## Historical 0.121.0 contract-only intake

The frozen `0.121.0` package was verified by the parent. At this preparation
stage, final backend source commit/PR binding, backend full gates, migration/role
review, controlled video cutover, serving installation and paired consumer/live
acceptance were pending. No acceptance was inferred from the source tests below.

The portable artifact is `vendor/api-client/pirate-api-client-0.121.0-70c02f0a.tgz`,
SHA256 `70c02f0a2fdc7913db52b82a627b1b0bf76e9c3d2eeb7a19770ac5f2f6d138f3`.
Embedded source/OpenAPI identity is
`api-next-contracts@5e2b660bd7dae2b1e840d47dda2610dd0ed8bb0a2f835a8da278296f2990450c`;
embedded client SHA256 is
`280f26c9d99cc03d74d3c9d73bc63d68726f95c9241adaa0e27d7a3ebb0067b3`.
All previous archives and required operation scopes are retained. Only the
generated-client dependency and its lock entry change version.

The exact old/new table comparison is retained in task-local
`.wrangler/adopted-source-agent/client-runtime-diff.json`, with reference-expanded
evidence in `client-runtime-expanded-diff.json`. Existing success/error tables
are unchanged. Seven existing response schemas change: public slug/ID detail
adds the adopted explicit video branch with `route:null`; video soundtrack
origin/song persona references become nullable for account erasure in those
shared projections and post/feed/profile readers. The existing wrapped age
variant remains identical. The new operations are `get_meNotifications`,
`post_meNotificationsNotificationIdRead` and `get_commentsCommentIdLocation`.
Unread count is supplied by the bounded list response; there is no separate
unread-count endpoint in this artifact.

The maintained runtime-table gate retains every previous operation, adds those
three and ordinary `get_postsPostIdComments`, and pins all response/status/error
table bytes to digest
`9a9bb51c0b2c7d51c2ae5ed501ee94a5b99ec88c1e10f7db9fbd68fdeb79e4ea`.
The provenance gate requires the real consumed operations as well. Neither gate
is bypassed. Installed generated code is never edited.

Targeted SSR/preload returns a bounded selector entry only. The browser resolves
the current account before generated detail/resolver reads; private windows
never enter public metadata, SSR payloads or router query caches. Current
session refresh/sign-out cancels private state, and the owning inline controller
revalidates the target branch before continuation. Historical receipt/href bytes
are not changed. The prepared navigation entry must remain unserved until the
parent establishes durable delivery and intended inline target acceptance.

Targeted song playback bypasses the shared feed grant cache and is disposed with
the private route. Ready video requests playback access only after an explicit
play action; pending/unavailable video still renders its authorized inline
thread. Back/Forward cache entry clears private views, and restoration resolves
the current session again.

Parent-run browser cases are in `e2e/notifications-navigation.spec.ts`. Supply
`NOTIFICATIONS_ACCEPTANCE_NOTIFICATION_ID`, `NOTIFICATIONS_ACCEPTANCE_COMMENT_ID`,
`NOTIFICATIONS_ACCEPTANCE_POST_PATH` and
`NOTIFICATIONS_PUBLICATION_EVIDENCE_SHA256` from a real unread durable delivery
and its separately held publication proof. Use the existing managed auth runner;
this source writer never accesses or provisions credentials. After paired serving
admission, run:

```sh
bunx --no-install playwright test -c e2e e2e/notifications-navigation.spec.ts --grep @notifications-navigation
```

That selects desktop and phone navigation, actual rendered focus, unchanged
unread state, back/forward and ordinary first-page reset. Explicit read marking
is separate and requires the parent's mutation authorization/environment:

```sh
E2E_ALLOW_MUTATION=1 bunx --no-install playwright test -c e2e e2e/notifications-navigation.spec.ts --grep @notifications-read-mutation
```

These cases are prepared, type-checked and listed only. Real browser hydration,
negative role/access fixtures and paired delivery/target acceptance remain with
the parent. Repeat the navigation cases with its real text/song/video,
primary/exact-alias and beyond-first-page/depth-eight fixtures; source mocks
establish none of those backend facts.

## 2026-10-17 — immutable 0.122.0 successor intake

This section appends to the sealed 0.121 history above. The exact parent-prepared
artifact is now vendored as
`vendor/api-client/pirate-api-client-0.122.0-f8e20a02.tgz`, SHA256
`f8e20a02368394ca0c41d29b0e4723ee3519057659c54c2e318002ea2e7f6c34`.
Embedded source/OpenAPI identity is
`api-next-contracts@0cfc6b10f84ff0445fc7952e49672d5f381a737d8c5ef608ccbca8a74b7563c3`;
embedded and installed generated client SHA256 is
`a6431a6a9e7e71c7c0ec0a057c91d2e8069075f9a77986baf75d6923965cc221`.
The parent's package verification passed. At this preparation stage, API107
source manifest
`20ffbe00dc94615318dbb4d9983ebc079d08e24a20a5940d7d6f9743730dc5cc`
was local and uncommitted; final commit/PR binding was not yet available.
The actual final binding is recorded in the 2026-10-18 successor below; the
original preparation/null-binding handoffs remain unchanged historical evidence.
All 46 prior tarballs, including 0.120 and 0.121, remain exact. The maintained
Bun install used the local tar with outbound syscalls denied for that child
process and task-local caches. Every other dependency and lock entry is frozen.

The actual comparison lives under
`.wrangler/adopted-source-agent/client0122-intake-20261017/`:
`runtime-table-comparison.json` records all response/status/error tables and
both scope digests; `client-source-delta.patch` records the entire generated
source difference. Between immutable 0.121 and 0.122 there are **zero** changed,
added or removed response schemas, success-status rows or error-definition rows.
The sole generated code change decodes JSON Pointer definition names (`~1` then
`~0`) before standalone `$defs` lookup and refuses an unsupported reference
prefix. No installed generated source was patched.

The existing 107-operation guard digest remains
`9a9bb51c0b2c7d51c2ae5ed501ee94a5b99ec88c1e10f7db9fbd68fdeb79e4ea`
for **both** releases. Adding only the missing affected operation
`get_publicPersonasPersonaIdActivity` expands coverage to 108 and changes the
digest to
`88168c4e8c90762a32de2a78e54ca41e4e07a53bb884337e70bcc70f86a4204d`
for **both** releases. This digest change is solely coverage expansion. All
prior operations and schema/status/error checks remain. The provenance scope
already included profile activity and remains intact, as does its owning check.

This zero delta between the two prepared artifacts does **not** erase the real
contract transition against API main6cf: the repaired generator comparison
reports 14 precise field changes across seven existing operations. Both
`soundtrack.origin_author_persona_id` and
`soundtrack.song_reference.song_author_persona_id` truthfully become null when
current persona/account privacy requires redaction. At this preparation stage,
the compatibility policy was empty and had to keep rejecting pending independent
review of this consumer transition and its exact declared deprecation. This
historical policy state does not describe the later final backend binding. No
compatibility waiver or response rewrite is treated as a detector-only fix.

Explicit owned video fixtures exercise the actual installed generated decoder
for public/authenticated home feeds, post detail, community feed, profile
activity, public ID detail and literal slug detail. They cover each nullable
author as null and as an authorized nonnull ID, malformed/missing author refusal,
the existing bare versus wrapped age variants, public/optional-session transport
ownership and video `route:null` without canonical or song-activity metadata.
Consumer tests retain the current behavior: a redacted song author yields no
song attribution; feed projection preserves authorized song post/title and
delivery facts without reconstructing an erased identity. These are local
contract regressions, not real account, delivery, playback or browser proofs.

At this preparation stage, remaining holds included the P1 compatibility
transition and exact deprecation review, final client/backend committed binding,
required/CI/full backend and migration review, paired durable delivery and
intended inline target acceptance, controlled cutover and serving. No runtime
route/controller, clock fixture, Paper source, provider, credential, flag or
financial behavior changed.

## 2026-10-18 — final backend/PR and current-main source binding

The immutable `notifications-client0122-final-backend-pr-binding.json` supplement
binds the same 0.122.0 archive to actual backend commit
`e352a7e56fa3029f8ba51b2a13edfb547372ae56`, merged through
[API PR623](https://github.com/pirate-social-club/api-next/pull/623).
Its exact tested candidate is `231cccc11ae0b6d4248332f8d78c6c8038b29825`,
tree `f8e3a5378b9602c76cbc1827fba26309680953d1`. The parent records independent
committed review `cd0176d4`, accepted migrations 271–273 review and successful
required hosted checks with all 14 rollup checks successful. The incident case
was explicitly excluded for unchanged release behavior under `b64b1282`; it is
not reported as a passing incident test. These are supplied final backend
records, not refreshed consumer or serving results from this source writer.

The exact portable archive remains
`vendor/api-client/pirate-api-client-0.122.0-f8e20a02.tgz`, SHA256
`f8e20a02368394ca0c41d29b0e4723ee3519057659c54c2e318002ea2e7f6c34`.
The embedded and installed generated client remain SHA256
`a6431a6a9e7e71c7c0ec0a057c91d2e8069075f9a77986baf75d6923965cc221`,
with source/OpenAPI identity
`api-next-contracts@0cfc6b10f84ff0445fc7952e49672d5f381a737d8c5ef608ccbca8a74b7563c3`.
The parent already committed the actual backend/PR fields in
`vendor/api-client-provenance.json`; those fields match the sealed supplement
and need no further change. Package, lock, generated code, guard scopes and every
historical archive remain unchanged by this metadata refresh.

The parent preserved the accepted 55-file source at
`534676ebef5a1388f64d05a8dec300ea8c107935` and normally merged accepted main
`60371f47b2a5d4e435e18fd0f299963a0324ef5b` as
`c71bcf2dd51d2a53a29aed4f94eb79be0b2565bc`, preserving both histories.
The starting source binding for this bounded refresh is
`1a001537361fb8ec87f4319ded2b91a00c8096cb`, with the parent-verified 1574-file
census SHA256
`05336ae2a2a95c271ddaf138825d22a5d61d2cc934c2db445354ac375e6d25c0`.
At this admission, [Solid PR98](https://github.com/pirate-social-club/pirate-web-solid/pull/98)
remains draft at the preserved `534676ebef5a1388f64d05a8dec300ea8c107935`;
the refreshed source has not been published there. This source writer performs
no merge, rebase, commit, index mutation or publication.

The real 14 nullable-author field changes across seven existing operations,
current-access redaction and navigation safeguards remain intact. The
108-operation runtime-table digest remains
`88168c4e8c90762a32de2a78e54ca41e4e07a53bb884337e70bcc70f86a4204d`;
all prior schema/status/error and required provenance scopes remain enforced.
No erased author identity is reconstructed, and video `route:null` gains no
canonical or song-activity metadata.

Fresh focused offline checks are recorded separately in the bounded source
handback. Parent-owned full verification, Worker/Storybook builds, the same
independent committed-source review and consumer CI/publication remain required.
Final backend source binding and migration review do not establish staging DDL,
holder/producer/LOGIN readiness, physical desktop/phone acceptance, paired durable
delivery, actual inline target/access-loss behavior, alias cutover or serving.
Runtime, Paper, Rewards, pilot, participant and SafeSTOP holds remain; no
financial/mainnet, credential, cybersecurity, release or deployment authority
is supplied by this metadata refresh.
