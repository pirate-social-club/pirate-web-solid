# Telegram handoff, October 13, 2026

This handoff records the local Telegram takeover and the latest read-only cloud checkpoint at 05:07:56 UTC (09:07:56 Asia/Tbilisi). The accountable local role is `telegram_coordinator`, session `01a13380-3a24-74b3-a6fa-ae35e508411e`. The workspace_owner requested this audit before further implementation. No new source work or deployment follows this checkpoint.

Telegram practice has historical real-phone evidence. Account recovery, association with an existing account and the post-lesson Connect action are still unbuilt. The identity probe has a clean, committed local successor with full local verification passed; that successor is not published or deployed. Cloud guest learning is still a draft awaiting its remaining checks and canonical acceptance.

## Authority and ownership

The dispatch authority is the control plane at `/media/t42/codedrive/Code/pirate-workspace` and its `tasks/records/`. The staging root at `/home/t42/Documents/agents` is not a product repository.

Local ownership is recorded in [the investigation task](record-snapshots/telegram-post-lesson-account-connection-spike.md), [the identity-probe task](record-snapshots/solid-telegram-privy-identity-probe.md) and [the delivery-hardening task](record-snapshots/api-telegram-practice-delivery-hardening.md). Their states are respectively planned, active and blocked. The probe's exclusive worktree is `.worktrees/pirate-web-solid/solid-telegram-privy-identity-probe`, on `feat/telegram-privy-identity-probe`. Review is due October 17, and the actual source expires at 2026-10-17 00:00 UTC.

Cloud retains guest learning/accounting, shared schema and migration/client custody, and its source branches. Its ordered remit is learning acceptance, accounting serially, guest UI against the frozen learning/client contract and accepted Solid handoff, then composed staging and Telegram recovery. The independent Telegram provider investigation can proceed locally in parallel under Spec 027. Recovery adapters must consume the accepted shared contract. See [cloud dispatch issue 595](https://github.com/pirate-social-club/api-next/issues/595) and its [custody checkpoint](https://github.com/pirate-social-club/api-next/issues/595#issuecomment-6138038433).

No ownership announcement was sent to cloud by this session. The local records establish the local assignment; they do not establish a remotely acknowledged handback of shared source, publication or staging resources.

Standing authorization covers the registered source, review, publication and staging work through the sanctioned paths. Telegram production and reward/fund activation remain excluded. There is no renewed general approval or OAuth credential-entry request pending. Real phone participation and actual resource custody are practical requirements.

## What has been demonstrated

The October 8 owner-phone trace proves the HTTP webhook practice picker and a complete ten-card lesson. The first reply arrived 1.3 seconds after acceptance and the first prompt 2.2 seconds after the song tap. Twelve voice answers completed the lesson at 18:59 UTC with 8/10 on first try; verdicts preceded the next prompt, which arrived in 3.3–7.1 seconds. This is historical evidence from [the regression record](record-snapshots/api-telegram-http-practice-regression.md) and its referenced redacted trace.

The subsequent clean prompt/ending release, PR 590, was recorded at source `b8332919dcc4235058d15c277b2de1a8755bfeda`. Its last recorded staging versions were jobs `26aa2ad8-b41e-41dc-a307-aa1a402557ae` and HTTP `4c785542-8e5f-4c09-9303-1a69ae1cc5d8`, each at 100 percent on October 8. This handoff does not freshly certify those serving versions. Jobs-side synthetic recovery passed, but the revised ending/buttons and real-client Resume remain unaccepted.

OAuth setup was completed by the workspace_owner on October 10. The archived public provider read confirms `telegram_oauth=true` for staging app `cmsw5pis300b80cladbxx7bsr`, with Pirate-controlled authorization bot `@staging_oauth_bot` and Privy callback `https://auth.privy.io/api/v1/oauth/callback`. Configuration is not a successful provider ceremony. Native Telegram OIDC remains the accepted linking contract until an independently reviewed amendment chooses another provider.

## Exact source and verification

| Source | Exact commit | Disposition |
| --- | --- | --- |
| Accepted research | `69898316dfa220faa63c99456a72cb7851049a5c` | Reviewed investigation only. |
| Original identity probe | `95a6991d2e5e5e83618300174b6f1f0300783785` | Independently reviewed; original Radicle patch preserved and seed receipt now confirmed. |
| Accepted Solid main | `45d07cb25b3267ad16f158aa40eff7d11ad49c5e` | Accepted Naming/Karaoke ancestry used as the probe's new base. |
| Local probe successor | `c584a347bce8481bbf0ab389ef3259059e11dd68` | Clean local merge; unpublished and undeployed. |
| Cloud learning PR 598 | `acf813248d8726273d317fe3a5e80f8123584a74` | Open draft; unmerged at the read time. |

The local probe tree is `fca5d088c1a83761768e140831faa624e7e87b97`. Ordered parents are the original probe and accepted Solid main listed above. The tree exactly matches the conflict-free `git merge-tree --write-tree` result. Relative to accepted main, only the thirteen original probe paths differ. The four protected files `src/worker.ts`, `src/worker.test.ts`, `wrangler.jsonc` and `worker-configuration.d.ts` match that main exactly.

At this exact local candidate, frozen dependency installation, 21 focused app/SSR cases, TypeScript and focused lint passed. Full `bun run verify` then completed with exit 0: 377 API, 1,772 app, 67 SSR and 420 design-system tests passed. The maintained configuration, ingress, helper/discovery, provenance, icon and local hydration/playback checks also passed. Existing warnings remain in [verify.log](verify.log), including 87 Solid Doctor warnings with zero errors. [source-readiness.json](source-readiness.json) binds source paths and hashes to these results.

The current candidate has not received its own independent review, fresh staging Worker build, product-graph build check or exact hosted CI acceptance. The older probe's build/review cannot be silently transferred to this merge. The original Radicle patch is `b9e8d15f9f20f396602649a311d9b8c98c76acc7`; confirming its exact seed head resolved the old delivery blocker. The subsequent SSH CI lookup timed out, so CI success remains unverified.

Read-only public staging GETs for the probe and verification config each returned HTTP 403. They prove neither deployed availability nor provider failure. No real Telegram OAuth return, cancellation or independent provider lookup matching sender, subject hash and verification time has been demonstrated.

The task-register scan completed with exit 0: 1,091 files valid and 233 review-date warnings, preserved in [tasks-check.log](tasks-check.log). This was a point-in-time scan before the final prose-only probe-record update and later disjoint task changes. Integration must rerun the live register gate. Canonical product heads stayed at Solid `0801168a8344e66fdccdb8fc3298251e6abb69cc` and API `f08c93dbe4602e982c00614c791930ffe2bed4e3`; no frozen release ref was moved.

## Cloud checkpoint and limits

The read of [draft PR 598](https://github.com/pirate-social-club/api-next/pull/598) at 05:07:56 UTC found head `acf81324`, updated at 04:26:30 UTC. Its author reports both type projects, freshness, client/clean-consumer verification, main compatibility, 60 focused cases, nine corrected native preparedness/Study cases and the full maintained check passing. The broad suite reports 5,996 unit, 24 SQLite/DO and 22 Node cases passing, with three existing environment skips.

The same PR reports Workerd reached 52 passing cases before nine suites stopped on an exported-module resolver gap. The reviewed resolver correction, fresh remaining Workerd/full results, final matched-head hosted checks and independent source/artifact acceptance remain pending. This coordinator did not run those cloud gates. [cloud-snapshot.json](cloud-snapshot.json) preserves the exact PR body and checkpoint comment; the issue comment is older at `d017191a`, so its results must not be relabelled as tests of `acf81324`.

Sixteen learning declarations are source-admitted; five accounting declarations and reward-capable mode remain unavailable. Prospective client 0.118.0 and migrations 0248–0263 are source work, not live migration, role provisioning, deployment or activation. Cloud acceptance must produce a frozen learning/client handoff before downstream implementation relies on it.

## Remaining work, in dependency order

1. Cloud completes the resolver repair, reruns the required checks on the final exact PR head, obtains independent acceptance and publishes the frozen learning/client handoff. Local Telegram work must not edit cloud branches, migrations or generated client artifacts.

2. The local coordinator completes candidate `c584a347`'s staging build, product-graph gate and independent review, then establishes the exact sanctioned publication/CI route. Solid's cloud GitHub route is scoped to Naming/Karaoke and its assigned guest UI successor; other lanes retain the historical Radicle route. The local origin push URL is `no-push`. Resolve the Telegram route against current policy and protected-main requirements; a helper must not bypass them. Record the published source and actual CI verdict.

3. Obtain an actual compatible staging custody handback. Recheck source, managed bindings, ingress identity and expiry; use the reviewed guarded workflow to deploy the accepted probe. Do not infer custody from an expired interval or a source merge. Any source successor that changes the October 17 expiry needs explicit recorded review.

4. Run the phone ceremony from a link opened inside Telegram, with same-tab return and a separate cancelled attempt. Perform the managed read-only Privy lookup by the original practice sender. Save only sanitized matching results for numeric identity, subject hash and verification time within the attempt window. Browser success alone cannot authorize a Pirate account.

5. Finish provider/contract selection and account mapping. Review new-user recovery into the same restricted account and lesson, explicit association with an existing account, conflicts, wrong identity, replay, cancellation and wrong browser. Preserve original history/persona attribution, avoid duplicate registration, silent merges and reward backfill, and keep the removed 16+ declaration out. Then admit [API recovery](record-snapshots/api-telegram-learner-recovery-claim.md), followed by [Solid recovery/Connect](record-snapshots/solid-telegram-learner-recovery-claim.md), using the frozen shared contract. Prospective rewarded behavior has separate acceptance and activation requirements.

6. Resolve API delivery-hardening admission through the normal lifecycle. The October 13 attempt exited 1 before creating a worktree: "api-next has no free auxiliary worktree slot (5/5 occupied)" and an overdue retained guest-interface publication checkpoint, ending with "Target api-next: 2 blocking breach(es)." Do not retire a cloud-owned checkout to bypass this. Once admitted, recheck six surviving findings against accepted source: retry scanner starvation, ten-attempt predecessor abandonment, scanner-only verdict retry, misleading handled-error logging, non-prompt reply-slot grading and long lyric-line bounds. Add adversarial real-store coverage while preserving ordering and idempotency. PR 590 superseded the old notice findings.

7. Refresh the actual serving readback and accept the clean ending and Resume on a real phone. The historical grading trace and synthetic recovery do not close this. Russian/Georgian localization has a separate held runtime/language acceptance lane; do not borrow its stale configuration or credential blockers as current English status.

8. Complete the separately planned [practice-streak design](record-snapshots/api-telegram-practice-streak.md). Ratify the day boundary, prevent duplicate increments from multiple completions/retries/Resume, and preserve attribution through recovery. UTC is a proposal, not an accepted decision; streaks do not change reward qualification.

## Audit and resumption

[SHA256SUMS](SHA256SUMS) binds this handoff, the two completed logs, readiness data, cloud snapshot and task-record snapshots. [audit-snapshot.json](audit-snapshot.json) records command outcomes, source parents/tree, unchanged canonical heads, control-plane checkpoint and retained foreign-state digest. Snapshots are dated evidence; resume from the live authoritative task records and inspect any later changes.

From this package, run `sha256sum -c SHA256SUMS`. In the probe worktree, `git show -s --format='%H%n%T%n%P' c584a347bce8481bbf0ab389ef3259059e11dd68` reproduces the source binding; `git diff --name-only 45d07cb25b3267ad16f158aa40eff7d11ad49c5e c584a347bce8481bbf0ab389ef3259059e11dd68` reproduces the thirteen-path scope. The readiness file provides each path's SHA-256.

The unrelated dirty persona task record was retained byte for byte and was not committed. No API implementation checkout was created, and no deployment, credential operation, account mutation, SQL execution or funded operation occurred during this takeover. The two monitored gates have finished; no further operation is delegated by this handoff. The clean probe checkout remains locally owned for continuation. This package is ordinary same-volume archive evidence, not an independent-volume preservation copy.
