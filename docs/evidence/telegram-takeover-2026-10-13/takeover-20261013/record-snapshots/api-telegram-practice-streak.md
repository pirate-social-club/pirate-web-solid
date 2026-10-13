id: api-telegram-practice-streak
title: Plan practice streaks from completed Telegram lessons
status: planned
repository: api-next
area: study
parent: api-telegram-http-practice-regression
priority: normal
worktree:
branch: feat/telegram-practice-streak
owner_role: workspace_coordinator
coordination: exclusive
blocked_by: none
updated: 2026-10-08
closed_at:
review_after: 2026-10-15

The workspace_owner requested the practice-streak follow-up be recorded while
PR 590 is completed. Investigate a streak of consecutive days with a completed
lesson and the legacy-style completion display. Specify the day boundary before
implementation; UTC was proposed but has not been ratified. Multiple completions
on one day must not inflate the streak. Retries and Resume must not count again.
Preserve completion attribution when account recovery or connection ships.

Practice streaks are independent of reward qualification, pool shares and
balances. No practice session may be reclassified as rewarded. This planned
record authorizes follow-up design; it opens no source lane or activation.
