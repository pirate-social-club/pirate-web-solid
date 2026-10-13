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
