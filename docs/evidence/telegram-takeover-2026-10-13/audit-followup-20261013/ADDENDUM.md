# Telegram audit addendum, October 13, 2026

This addendum incorporates the cloud auditor's recomputation and corrects the interpretation of the [original handoff](../takeover-20261013/HANDOFF.md). The original 41-file export remains unchanged and anchored at Solid commit `1bd6b05bdeb6479c4db6a7295bca4eccb1a0a602`. This is an additive correction, not replacement of sealed evidence.

The cloud auditor reports that both original manifests, the portable proof script, source parents/tree, thirteen-path hashes, protected-file equality, local test totals and phone-trace timings recompute correctly. Those are auditor-reported results. The refreshed GitHub observations and source differences below were independently read by `telegram_coordinator`; no cloud test was rerun locally and no deployment occurred.

## Current cloud source

The read at 05:41:14 UTC found [PR 598](https://github.com/pirate-social-club/api-next/pull/598) open and draft at `ae602637c97d4009bdcc78d26b173dcf49873543`, based on `4a791f27fb7c983689fe75150953be67ed25f709`. GitHub's comparison from the original `acf81324` snapshot reports ten commits and 29 changed files. These observations and exact check-run links are in [live-state.json](live-state.json).

[Commit 39368540](https://github.com/pirate-social-club/api-next/commit/39368540d42cff0c3a752a781af336a61d85c9b8) adds the workspace-public-alias resolver and uses it in the Workerd pools. The source correction is present; the old handoff's statement that the resolver repair was still absent is superseded. Presence of a fix does not establish passing Workerd execution or final matched-head acceptance. The PR body still carries its older pending-check wording and must not substitute for current run results.

At that read, `secret-boundary`, `Advisory policy`, `hns-regtest`, `postgres18-shape`, `postgres17-namespace`, `postgres17-recovery` and `postgres17-general-3` had succeeded. `check` and `postgres17-general-0`, `-1` and `-2` were still running. The reviews and review-thread reads at 05:38:47 UTC returned empty lists. Refresh all of them if the source changes; this snapshot grants no acceptance.

The read of [issue 595](https://github.com/pirate-social-club/api-next/issues/595) still ended at the [older d017191a custody checkpoint](https://github.com/pirate-social-club/api-next/issues/595#issuecomment-6138038433). Its local test/review assertions remain source-author reports at that checkpoint. It states exclusive shared schema/client custody and the downstream order. It is not a current staging-resource handback or independent acceptance of ae602637.

## Telegram is coupled to the cloud learning change

[Commit 06ff4563](https://github.com/pirate-social-club/api-next/commit/06ff456345e9a889a49018aafce486587b13acf5) changes `packages/platform-cf/src/telegram-study-learner-store.ts`. The enrollment transaction acquires `pg_advisory_xact_lock(83000003,1)` before its community/integration and learner locks. When creating a new restricted account, it calls `provision_account_participation_owner_v1` inside the same transaction immediately after inserting the user. The global lock is in the enrollment method before the new-account branch; it should not be described as a lock affecting only newly created identities.

The source also adds native-role, rollback, owner-attribution and replay assertions to the Telegram learner and HTTP fixtures. Those assertions exist in source; this addendum does not claim their final matched-head execution is accepted. [telegram-enrollment.diff.txt](telegram-enrollment.diff.txt) preserves the tool-normalized fetched commit diff; it is an excerpt for inspection, not an apply-ready Git patch, and [live-state.json](live-state.json) records the complete ten-commit path inventory.

Local and cloud ownership remain distinct writers, but their acceptance is coupled. Cloud owns the shared participation/account-birth changes and must freeze the Telegram adapter and its required function/role contract in the accepted learning handoff. Local delivery hardening must recheck its six findings against that exact accepted successor and the complete shared Study delta. Inspecting main alone is insufficient. No local writer may race cloud's branch or recreate its owner/schema/client work.

The next real-phone acceptance must bind the actual serving HTTP/jobs source and versions to the composed release that contains the accepted learning changes. Cover fresh learner creation through the webhook, the preserved practice-only owner/session attribution, completion, clean ending and Resume. Existing-user recovery and retry behavior require the relevant source/store gates as well. Record the role/function readiness and actual managed release receipts. Historical phone timings cannot be transferred to a source with new enrollment locking and account-birth behavior.

One further source attribution needs precision: the 18:54–18:59 October 8 phone run belonged to PR 588 source `5ac53087e7447f0abfa8633e707522a93fcd1036`, not PR 590 source `b8332919`. The newly included [phone-run jobs receipt](phone-run-jobs-deploy-receipt.json) and [HTTP receipt](phone-run-http-deploy-receipt.json) bind that source to the earlier versions. PR 590 deployed around 20:14–20:16 UTC, after the trace; its revised ending/Resume remained phone-unaccepted in the existing [pending receipt](../historical-practice/phone-acceptance-pending.json). Either historical source is too old to certify the future composed successor.

## Provider configuration evidence

`@staging_oauth_bot` and the claimed Telegram client's allowed callback `https://auth.privy.io/api/v1/oauth/callback` are owner-reported setup values in prose/task records. This package contains no raw dashboard/client-settings read binding that bot and callback to the selected application. Treat them as configuration assertions awaiting a sanitized managed readback or successful reviewed provider ceremony, not verified configuration.

The October 13 public provider response establishes only the three recorded flags. It cannot prove bot selection, client-to-app association, callback correctness, same numeric identity or freshness. The October 9 archived response is earlier disabled setup. The raw October 10 response was not found; neither the corrected date nor the current enabled flags repairs that evidence gap. No credential entry or rotation is inferred as necessary.

Before provider acceptance, establish the actual staging app/client/bot/callback relationship through the approved read-only workflow and bind the real Telegram-origin return to the independent managed sender/subject-hash/verification-time lookup. Keep credential values and raw identity data out of saved evidence. Native OIDC remains the accepted account-linking contract unless a reviewed amendment selects another provider.

## Local checkout pins and evidence limits

| Repository | Local canonical checkout pin | GitHub main at this read | Commits behind |
| --- | --- | --- | --- |
| Solid | `0801168a8344e66fdccdb8fc3298251e6abb69cc` | `45d07cb25b3267ad16f158aa40eff7d11ad49c5e` | 27 |
| API | `f08c93dbe4602e982c00614c791930ffe2bed4e3` | `4a791f27fb7c983689fe75150953be67ed25f709` | 18 |

The original phrase “canonical heads” referred to the local workspace checkouts. It was ambiguous and must not be interpreted as current GitHub main. The accepted Solid main used to reconcile the probe and the PR's API base were already the newer remote heads. This correction does not move a checkout or frozen release pin.

The local `verify.log` supports the displayed test totals, but contains no process-exit marker. Exit 0 remains a coordinator attestation from tool completion recorded in JSON/task prose. The empty historical `types-final.log` independently proves no type-check outcome. Do not promote either omission into a raw gate receipt. Future runs should preserve exact source, command, start/end time and exit status beside their raw logs.

Manifests establish byte integrity relative to their Git commit anchor. The 15 portable Git objects and nine path proofs establish internal content bindings to the supplied control-plane commits. They do not establish an external publication anchor, reviewer signature, truth of recorded test outcomes or shared-resource custody. The cloud auditor did not check Radicle receipt, the failed SSH CI lookup, staging 403 observations or accuracy of the local task register. Those remain qualified local observations, not newly verified by this addendum.

The three live owning task records were updated in exact-path control-plane commits and are included in [record-snapshots](record-snapshots), with [internal Git bindings](control-git-object-proofs.json) and [checkpoint metadata](record-checkpoints.json). The same previously audited proof verifier recomputes these new bindings. They retain the external-anchor limitation described above.

## Corrected next steps

1. Cloud finishes matched-head local/hosted checks and independent source/artifact acceptance, then supplies a frozen handoff that explicitly includes the Telegram enrollment/owner/function-role changes. Refresh the PR status and main before accepting a source successor.

2. Local probe work completes its remaining staging build/product-graph gate and independent exact-candidate review, establishes the sanctioned main/CI route and obtains actual compatible staging custody. Evidence-branch publication alone closes none of those gates.

3. Read back the provider's actual app/client/bot/callback binding through the approved workflow, then deploy the reviewed guarded staging candidate and run the real Telegram-origin return, cancellation and managed identity/freshness verification.

4. Recheck the six delivery findings against the exact accepted cloud successor before implementation. Accept practice on the final composed serving source, including fresh enrollment and existing progress/Resume. This explicitly replaces steps 6 and 7's weaker reliance on main and historical phone evidence.

5. Complete reviewed provider/contract selection and API recovery, then Solid recovery/Connect against the frozen shared contract. Streak design and held localization acceptance remain separate. Historical practice stays reward-free.

The probe still expires at 2026-10-17 00:00 UTC. Finish review, CI/main acceptance, staging handback, guarded deployment and phone proof within that source bound. If the gates cannot be completed in time, stop expired probe execution and prepare an explicitly reviewed source successor with a recorded new expiry and refreshed receipts. The date does not waive review or handback, and an expiry amendment does not require another general owner-approval window under the standing authorization.
