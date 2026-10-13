id: api-telegram-practice-delivery-hardening
title: Resolve remaining Telegram practice delivery review findings
status: blocked
repository: api-next
area: study
parent: api-telegram-http-practice-regression
priority: high
worktree:
branch: fix/telegram-practice-delivery-hardening
owner_role: telegram_coordinator
coordination: exclusive
blocked_by: none
updated: 2026-10-13
closed_at:
review_after: 2026-10-17

The workspace_owner instructed the coordinator to register the outstanding low review findings from PRs 585 and 588 before account-connection handoff. Their source record is api-telegram-http-practice-regression; PR 588's independent review is https://github.com/pirate-social-club/api-next/pull/588#issuecomment-6066511836. They remain required before any production release of Telegram practice and are not fixed by this registration.

Recheck each finding against current accepted main before implementation. The PR 585 findings are scanner starvation when fifty or more prompts wait on verdict retries, a pending predecessor at ten attempts not treated as abandoned, verdict retries driven only by the scanner, and inline logging calling a caught handler error handled. Preserve durable delivery, feedback-before-prompt ordering and idempotency while repairing them; include adversarial retry/abandonment/scanner tests through the real store.

The surviving PR 588 findings are lookup of a non-prompt reply slot as an exercise prompt and bounding an unusually long lyric line. Require a stored force-reply prompt for grading; unrelated text/voice must consume no attempt. Cover not-a-reply, cancel, conversation epoch/expiry and persisted state through the real store where still applicable. The notice flag, its notice-specific coverage and notice wording findings were superseded by the owner-directed removal in PR 590; do not reintroduce disclosure copy or its state merely to close obsolete findings.

Follow normal api-next source admission, focused database/Worker tests, full required gates, independent exact-source review and GitHub squash PR. Use maintained staging wrappers if deployment is admitted. No production, reward activation, provider credential operation, history backfill or bot UX expansion is authorized by this record. This planned registration opens no source lane.


## Local Telegram ownership and admission result, October 13

The workspace_owner asks telegram_coordinator in session 01a13380-3a24-74b3-a6fa-ae35e508411e to own Telegram while cloud finishes guest learning PR 598. This task remains the delivery-only follow-up; shared Study authority, migration/client generation and cloud source branches stay with cloud. Recheck current accepted main and the final cloud delta before any later merge.

Drive-check passed. Normal bin/worktree-open exited 1 before creating a checkout: "api-next has no free auxiliary worktree slot (5/5 occupied)" and "api-next/api-guest-participation-interfaces ... checkpoint overdue (6 unpublished commit(s), 36h old)"; final result was "Target api-next: 2 blocking breach(es)." The retained guest-interface checkout is frozen under the cloud handoff, so this session neither edits nor retires it. No source or test change, API lane admission, publication or deployment is claimed. Read-only findings review and the independently scoped Solid provider investigation may continue; retry API admission after actual structural/capacity resolution.


Cloud audit correction, October 13. PR598 at ae602637c97d4009bdcc78d26b173dcf49873543 includes06ff456345e9a889a49018aafce486587b13acf5 in the Telegram enrollment path. Its transaction takes global topology lock83000003,1 before community/integration/learner locks and provisions the original account participation owner during new-account birth. Cloud retains shared adapter/schema/client custody until an accepted frozen handoff. Recheck delivery findings against that exact successor and full shared Study delta, not main alone. Real phone acceptance must bind actual HTTP/jobs source and versions to the composed release containing the accepted change, including fresh webhook enrollment, practice-only attribution, completion/ending and existing progress/Resume. No cloud branch, API source or serving state was edited for this audit.

Deployment receipts and recorded chronology support attribution of the October 8 full phone trace to PR 588 source 5ac53087, before PR 590 b833's later deployment. No contemporaneous post-deploy readback showing the new HTTP/jobs versions serving at 100% during 18:54–18:59 is archived; the trace source is a strong sequence inference, not an observed serving-state proof. Neither historical trace nor synthetic recovery certifies the future composed source. The additive cloud package docs/evidence/telegram-takeover-2026-10-13/audit-followup-20261013 on handoff/telegram-audit-20261013 records refreshed GitHub checks, source diffs and corrected evidence qualifications.

This explicitly refines the earlier main-only recheck instruction. Recheck all six surviving findings after the frozen learning/Telegram adapter handoff, including account-birth function/role readiness, rollback, immutable owner attribution and replay under actual composed gates. Source fixture assertions are not final matched-head execution. Admission remains blocked as recorded; no API source lane was created.


## Migration allocation and serving-proof correction, October 13

The dated GitHub refresh from 06:01:23 through 06:03:15 UTC finds PR 598 open, now ready for review, at efe07c5acda838041b3e47a6ef7f1a48ea9b16d3. Its only change from ae602637 is the owned Telegram learner denial-boundary test setup. The exact-head hosted postgres17-general-1 and -2 checks and postgres17 aggregate failed; shard -1 reports 14 failures, while -2 reports exit 143. Earlier full local passes do not close those hosted gates. No live ACL change or cloud source edit occurred in this audit.

The omitted 0248 collision is now explicit. PR 597 at 2071aea3 used 0248_media_alignment_alert_cursor.sql while PR 598 owns the sixteen source declarations 0248–0263. Alignment candidate 6fb1014ba3679fb8452daaf493d2da2a6f3c4af6 renames its unchanged SQL to 0264 and holds merge/application pending cloud/schema approval. Its learning-first order is a proposal, not an accepted allocation or frozen handback. The prospective combined manifests have unique 0001–0264 ordinals and 247 identical shared declarations; no live migration ledger was read and not every SQL source was recomputed.

Cloud must record the accepted predecessor/application order and exact migration inventory before freezing the Telegram adapter/function-role/schema/client contract. If learning lands first, alignment requires rebase onto that accepted source, combined baseline/reset/checksum regeneration and fresh matched-head review/checks. If alignment 0248 is already accepted or applied first, preserve its applied identity and have cloud review the sixteen-migration learning renumbering and all affected generated outputs, fixture/readiness pins and acceptance checks. No local writer selects or executes that schema change.

The new additive cloud evidence is docs/evidence/telegram-takeover-2026-10-13/migration-gate-20261013 on handoff/telegram-audit-20261013. Fresh composed phone acceptance requires exact source/artifact binding and observed intended HTTP/jobs serving versions and traffic allocation before and after the bounded trace. The historical deployment receipts alone do not prove contemporaneous 100% serving. The probe expiry remains 2026-10-17T00:00:00Z; stop expired execution if gates remain open and prepare an explicitly reviewed successor with a new recorded expiry. Canonical acceptance, actual staging handback and provider/phone proof remain open.
