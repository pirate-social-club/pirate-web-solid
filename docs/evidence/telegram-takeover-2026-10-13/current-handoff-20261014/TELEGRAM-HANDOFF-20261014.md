# Telegram task handoff, 2026-10-14

Snapshot: 2026-10-14 04:49 UTC. Refresh GitHub, custody and live staging facts before acting. This brief is sufficient to continue without the prior conversation. The companion telegram-handoff-live-state-20261014.json contains the sanitized live metadata, exact check receipts and latest cloud custody/implementation comments. SHA256SUMS binds the two files; the published Git commit is the package anchor.

## Outcome and current position

Finish Telegram practice without requiring a Pirate account, prove a secure web login from a real phone, then implement and accept the reviewed Recover/Connect journey. Recover preserves the learner's original restricted account in place. Connect associates practice history privately with an independently signed-in existing account. Neither flow merges owners, moves historical sessions, promotes bot-local identities or backfills rewards.

Source preparation for the first staging release is complete. The important fixes and the login probe are merged. The selected recovery/Connect contract is reviewed and green. The staging release has not been accepted: no new serving, applied-grant, migration or phone acceptance receipt appears in the task thread, and this local coordinator has not executed those steps. Last retained managed ledger evidence is 0246, not 0265.

Cloud accepted the run sheet and handed workstation release/resource custody to the local coordinator at 2026-10-13 18:28:56 UTC. That dependency is resolved; do not keep asking cloud or the owner for the same handover. Actual access, checkout writer ownership and current runtime readiness still need checking. The immediate next work is the local operator's guarded staging release, starting with the Solid-only probe.

The source expires at 2026-10-17T00:00:00Z, approximately 67 hours after this snapshot. If the deadline is missed, prepare an explicitly reviewed successor. Never extend it by assumption.

## Authority, ownership and repository boundaries

The owner grants indefinite approval for necessary Telegram work and delegates in-scope judgment. [The binding direction](https://github.com/pirate-social-club/api-next/issues/595#issuecomment-6151444309) explicitly approves the exact twenty-three-function incremental staging EXECUTE grant. Do not ask again for ordinary implementation, independent review, CI, sanctioned publication, the reviewed grant or guarded staging release.

Technical requirements remain: exact accepted source and artifact binding, green required checks, managed credentials, exclusive writer/resource custody, fresh target and privilege readiness, bounded execution and recovery. This task remains nonmonetary staging work. Unrelated production, funded operations, new credentials, credential rotation/export, the separate four guest-study role setup and irreversible resets/restores are excluded.

The cloud_telegram_coordinator owns the complete Telegram task. The local coordinator is the bounded workstation operator and reviewer. A new local agent continues that operator role; it does not silently replace cloud as product owner or write to cloud branches.

[The latest custody record](https://github.com/pirate-social-club/api-next/issues/595#issuecomment-6152395223) freezes API and Solid main at the pins below. While local custody holds, cloud promises no main merges, no recovery-branch push and no staging commands. Cloud may continue isolated source work. A different writer or changed runtime can still exist: inspect current processes, refs and effective resource state before mutation. Hand custody back with sanitized execution receipts, or an explicit disposition if execution is deferred.

The authoritative local root is /media/t42/codedrive/Code/pirate-workspace. Read its AGENTS.md, the applicable child AGENTS.md and tasks/records/telegram-cloud-coordinator-takeover.md. The latter's status complete means the earlier documentary transfer completed; the product task remains unfinished.

The launch directory /home/t42/Documents/agents is a staging/recovery area, not a Git repository. Do not build or install there. Product canonical checkouts are integration-owned; obtain checkout writer handover and use the maintained workspace/worktree process. Never create a duplicate clone, detach/reset a canonical checkout blindly, force-push, overwrite foreign edits or discard protected evidence. API integrates through GitHub squash PRs; Solid integrates through normal merge PRs.

## Frozen release and active PRs

| Repository/item | Exact head or accepted commit | Status at this snapshot |
| --- | --- | --- |
| api-next main, release source | b8efd833af7e9729c1e988f81aa8804776cf74fe | Frozen, includes merged #605 and migrations through 0265 |
| pirate-web-solid main, Part A | f668c090e00b1a5792406075476620aad49f8890 | Frozen, includes #64 probe and #65 test-only repair |
| [API #604](https://github.com/pirate-social-club/api-next/pull/604) | 153658a4ead7ad1f4bc26a63fc46a249f75177d6 | Open, ready rather than draft, independently reviewed; 13 distinct checks pass; merge held by custody |
| [Solid #70](https://github.com/pirate-social-club/pirate-web-solid/pull/70) | 4fdcdb550577c379b9e50ad91ad47c02eeffa82f | Draft recovery CI vehicle; applicable checks pass; source finding cleared; do not merge while probe is needed |
| [API #606](https://github.com/pirate-social-club/api-next/pull/606) | 8bc510915b594b53e2c821c6754f901b78c358f5 | Draft groundwork; all 13 checks pass; no reviews; merge held |
| [Solid #71](https://github.com/pirate-social-club/pirate-web-solid/pull/71) | 51c9fc41502ee992d0f9dc4ef2ad9624c6776e9a | Draft registration-intercept groundwork; applicable checks pass; no reviews; merge held |

Solid's applicable checks are verify, Solid Doctor(PR) and storybook-audit. Solid Doctor(main) is skipped on these PR heads. API #604 has an additional successful secret-boundary execution, so the API returns fourteen check-run records for thirteen distinct checks; there is no red current-head check.

Source milestones already integrated are API #598 learning foundation, API #600 legacy producer/deletion corrections (merge 97a48303), API #603 six Telegram delivery fixes (merge 78ac06fa), API #605 least-privilege cancellation/grant/preflight (merge b8efd833), and Solid #64 corrected privacy-safe probe (normal merge b835c734). The former Workerd resolver, PostgreSQL baseline/fixture and shard-timeout failures are historical source issues already fixed. Do not restart that repair from superseded CI logs.

API #606 keeps a recovered sender on the sender's own original reservation when enrolling on another bot and explicitly refuses restricted learners from ordinary session readiness regardless of wallet state. Solid #71 adds an optional registration refusal on sign-in surfaces; no current surface opts out yet. These are groundwork, not a functioning Recover/Connect product. Their green CI is not an independent review, which remains outstanding.

Solid #70 removes the probe and preserves private handling of existing Telegram-link routes and aliases. Its tree is 2e55eeacb73185f2c9a4a8c404782bd65ef66590. The old held revert bd319b438e6e8ef92235050fb6475f957efe110b reintroduced a privacy gap and must not be deployed.

The nearby API #602 / Solid #62 guest Study and reward-recovery lanes and the Paper PRs are separate work. They are not part of this frozen Telegram release. Coordinate frozen auth-contract ownership and next migration ordinals with those writers; proposed 0266/0267 numbers are not a license to create gaps or overwrite another migration.

## Accepted run sheet and execution clarifications

Use [the accepted workstation run sheet at e2e7e790](https://github.com/pirate-social-club/pirate-web-solid/blob/e2e7e7909ae6e07cf73bf028747b1b291d2fcb8e/docs/evidence/telegram-takeover-2026-10-13/contract-context-20261013/telegram-staging-workstation-run-sheet-20261013.md). Its SHA256 is eaac42d667dce9f3291c431973569ccac13a4ecbdafbd16a11a526239b716a5c. It was fetched back exactly. Ten Bash blocks passed syntax checks; the local data-only grant renderer was checked for count, quoting and exclusive output. Cloud independently ran the renderer and its resulting admission against disposable PostgreSQL 17; that cloud result is attributed evidence.

Cloud's acceptance comment supplies three important clarifications. A dormant Rewards readiness refusal is separate from Telegram readiness if the exact ledger independently verifies. Telegram activation privilege admission is required only when the effective served configuration enables Telegram. The composed practice phone journey needs served enabled and practice_enabled; the provider probe itself does not.

Do not blindly follow the older cloud packet's canonical-detach commands or its pre-migration rollback assumptions. Use the accepted run sheet, maintained checkout governance and the corrected recovery record. The effective managed SQL runner/connection must be bound before executing the rendered grant file; it is not assumed from the example role.

The document-building permission rejection is resolved. Cloud reported an automatic rejection but supplied neither the exact attempted command nor the rejection text. Plain Markdown publication through GitHub completed the documentation task without changing permission settings, obscuring commands or running the rejected script. This is no longer an execution blocker.

## Local and managed starting facts

The local product checkouts were read-only inspected and clean at API f08c93dbe4602e982c00614c791930ffe2bed4e3 and Solid 0801168a8344e66fdccdb8fc3298251e6abb69cc. These are old local pins, not current GitHub main or deploy candidates. Reconcile source only after actual checkout writer handover. API's HTTP wrapper expects a compatible built Solid sibling; verify the maintained layout rather than inventing an unregistered symlink or duplicate clone.

The workstation has Infisical, Bun, SSH and project-local Wrangler 4.123.0. Credential presence and historical successful read access do not establish current permissions or serving-principal binding. Use existing managed injection, never print/export secret values or place a password-bearing URL in argv. The source project is fac45f92-9450-42fb-8c2f-f20d043fdfab, with established staging /services/api-next and /services/api-next/operator injection.

The latest retained managed database read was 2026-10-13T11:17:46.373Z: PlanetScale database staging, branch main, schema api_next, PostgreSQL 18.6, 246 exact migration rows through 0246_telegram_restricted_learners.sql. It rolled back a READ ONLY transaction. It bound the existing credentials to origin aws-us-east-1-4.pg.psdb.cloud/database postgres, but did not establish the current serving-version/runtime-login binding. Repeat it; do not use this old receipt as execution readiness.

Candidate HTTP/jobs/media CONTROL_PLANE uses Hyperdrive 8cb7658a0f7143359c1becfec6a15c23. Read the current complete Worker traffic allocations, every serving version and effective Hyperdrive origin, then bind the observed database/login to the actual serving connection. Latest uploaded version and source-config IDs alone do not prove serving.

G1 applies only the twenty-three-statement ordinary-account EXECUTE block, trimmed UTF-8 SHA256 474d70e56baef8874150f509c40207957affc10682934270c49e9d784604f814. Render the schema-qualified grantee from the observed serving principal, not a guessed api_next_app. Do not run all of roles.sql.example. Preserve all 147 required denials, including generic closure, legacy/operator settlement and guest authority. The preflight must also refuse direct or indirect owner membership even without inheritance.

The intended upgrade is nineteen migrations 0247–0265. The complete filenames/hashes are in the run sheet. Migration 0265 hashes to 337b5469bdf01595413349517f1c0750530280a4a38ac8fd007a2d2e3c4e106f. The maintained db:migrate CLI accepts only --dry-run; no --expected-ledger CLI flag exists. Its exported API supports exact expectedLedger for a separately reviewed adapter. Refuse a changed target, missing prefix or checksum discrepancy; do not rewrite applied migrations or assume the old prefix remains.

Local control currently has a foreign unstaged edit in tasks/records/solid-hns-claim-persona-picker.md. Its observed SHA256 is b69bd15c71afa13bfb6514ee7f30728e197d408cd35fec395b645950c058d41f. Preserve it. This coordinator's own-record-only exception requires the lifecycle lock, empty index, exact pathspec and unchanged foreign bytes. Documentary artifacts belong in the existing ignored archive package; no loose root scratch files.

## Next actions for the receiving agent

1. Read this snapshot, current issue #595 and the custody acceptance; announce continuation of the existing local operator custody if taking that role. Verify no intervening handback, main/ref movement, active checkout writer or competing release. No renewed owner permission is needed.
2. Reconcile the permitted checkouts to the frozen accepted sources through the maintained workspace process. Establish fresh managed credential identity, current serving/app/config/artifact and HNS/browser readiness, and the compatible recovery predecessor.
3. Execute Part A first: Solid-only guarded staging deploy from published clean main using bun run deploy:staging:hns-guarded. Capture before/after allocations and live HNS/browser/private-route results. API migration is not a dependency for the phone provider probe.
4. When the probe is actually serving, ask the participant for the real-phone login. Capture sanitized phone evidence and the managed read-only provider numeric-ID, subject and freshness lookup. Select Privy only if it passes; otherwise pursue native Telegram OIDC under the same identity standard.
5. Execute Part B under the accepted packet: verify the actual prefix, apply the reviewed migration set to 0265, apply only the approved 23-grant section to the verified principal, and read back all 265 identities plus grants/denials. Bind the actual SQL runner. The schema upgrade can take exclusive Study-table locks; use the reviewed bounded window and source-forward recovery, not an automatic downgrade.
6. Establish per-instance Workflow version/alignment compatibility before HTTP/jobs/media release. Counts alone do not prove that old instances use new code. Require no pending alignment or a reviewed bounded drain/compatibility condition; do not terminate instances. Deploy via bun run deploy:worker, then verify actual serving allocations, effective config/roles and composed practice/Resume on the phone.
7. Post sanitized receipts and an explicit custody handback to issue #595. Cloud resumes main integration, including #604, independently reviewed #606/#71, Specs 014/026 and the rest of Recover/Connect. If execution cannot proceed, record the concrete technical dependency and custody disposition instead of leaving an unexplained indefinite freeze.
8. Finish the reviewed recovery/Connect implementation and final composed phone journey after provider proof and spec acceptance. Keep default-off disabled endpoints and progress entry off until those gates pass. Do not claim completion from probe deployment or green groundwork PRs alone.

## Recovery/Connect decisions and remaining design

R1 is a distinct limited practice-history session, never ordinary full-account authority. R2 retains practice-only status until a separate reviewed transition; historical practice attribution stays fixed. C1 is a private read-only history relation with bot lessons continuing the original practice profile, no persona swap and no implicit future-login authority. E1 is one Open my progress action, not Save my progress. These four choices are selected under owner delegation; earlier owner-decision-pending text is historical.

The reviewed contract requires declarative principal/capability admission and default refusal of undeclared authority, protected explicit confirmation, independent proof of the same numeric Telegram ID, no automatic registration during Recover/Connect, no history merge/reassignment/reward backfill, and durable same-target provider intents ending committed/refused/uncertain. There is no cross-system atomicity promise. Adding a future sign-in method requires separate learner consent.

[Cloud's implementation plan](https://github.com/pirate-social-club/api-next/issues/595#issuecomment-6152929758) proposes a twelve-hour nonrenewable __Host-pirate_practice cookie, provider-neutral owner-only claims/intents/connections/session tables, epoch/deletion fences, an empty declarative restrictedPracticeLearner policy and progress_entry_enabled default false. These are coordinator plan choices requiring the relevant source/spec review, not deployed features. The first limited release covers read history, association/revocation, sign-out and erasure; website practice-only Study continuation is a follow-up.

The new auth kind touches phase-0 frozen contracts/auth.ts and endpoint.ts. Cloud prepares a reviewed patch; the authorized integration coordinator handles that boundary under the repository's freeze rule. Do not invent an ad hoc path allowlist or let the limited cookie satisfy ordinary authentication.

Old Study producer uncertainty must remain fenced: matching HEAD, lease expiry or an identical late PUT is not terminal-writer proof. Legacy Karaoke settlement remains evidence-gated. The retained six-host reset inventory had no current recording subject and no reset ceremony ran; that does not prove general producer quiescence or authorize resets.

## Evidence and completion standard

The coordination thread is [api-next issue #595](https://github.com/pirate-social-club/api-next/issues/595). The cloud-readable handoff branch is handoff/telegram-audit-20261013 in pirate-web-solid. Its original exports and sealed checksums remain intact. Frozen specs006/014/026/027 and Git-object proofs are in [contract-context export 666d0bb3](https://github.com/pirate-social-club/pirate-web-solid/tree/666d0bb3820ea274270527ff2ba8869c26e44949/docs/evidence/telegram-takeover-2026-10-13/contract-context-20261013). The current [authorization/recovery audit](https://github.com/pirate-social-club/pirate-web-solid/blob/f5e607a24ca51ee3116570cc9868a16645ba0b25/docs/evidence/telegram-takeover-2026-10-13/contract-context-20261013/telegram-standing-authorization-g3-review-20261013.json) and [run-sheet audit](https://github.com/pirate-social-club/pirate-web-solid/blob/0567d6bcad79832c52431d871b91ec08944b7e84/docs/evidence/telegram-takeover-2026-10-13/contract-context-20261013/telegram-run-sheet-unblock-review-20261013.json) preserve source reviews and runnable bounded proofs.

The local documentary package is /media/t42/codedrive/Code/pirate-workspace/.archive/telegram-account-connection-spike-2026-10-09/cloud-takeover-20261013/. A cloud agent must use the pinned GitHub copies; that workstation path will not exist in its container.

Historical phone evidence on October8 belongs to API 5ac53087. It predates #590's later deployment and proves neither the current composed API nor the login provider. OAuth enablement flags alone do not prove the configured bot/callback, managed identity or a successful phone login.

This handoff verified GitHub state/check receipts and local Git status. It did not query fresh managed serving state, rerun full native product suites, independently review #606/#71, execute staging changes or perform a phone test. Completion requires actual composed serving, provider proof, accepted recovery/Connect behavior and the final phone journey, with evidence and custody handback recorded.
