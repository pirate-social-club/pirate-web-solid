id: solid-activity-results-screens
title: Duolingo-style results screens for Study and Karaoke
status: complete
repository: pirate-web-solid
area: study
parent:
priority: high
worktree:
branch: feat/activity-results-screens
owner_role: workspace_coordinator
coordination: exclusive
blocked_by:
updated: 2026-09-23
closed_at: 2026-09-23
review_after:

The owner wants Study and Karaoke completion to feel like Duolingo: a
results page, then later a streak page. The owner chose option 3 on
2026-09-23: build the results page for both activities now, and add the
streak page only when it can show a streak actually earned by that session.
The streak page, qualification, leaderboards and the presenting-persona
control stay with `rewards-activity-ui`. Rewards are disabled everywhere, and
the Study v2 adapter does not map qualification or streak data.

Scope:
- One shared results presentation: a celebratory heading, a large score, two
  or three stat tiles, an honest caveat when needed, and a single primary
  Continue that returns to the song, with a quieter "again" action.
- Study: accuracy and first-pass correct out of total cards from the server
  lesson state. Replace the "Study again" and "Karaoke" button pair. Remove
  the fabricated Monday-to-Wednesday week-strip fallback. Use design tokens,
  not dark-only hex colours, on the results screen.
- Karaoke: today a finished take leaves the frozen lyric and "Karaoke again".
  Show the server session summary instead: the final score, lyrics accuracy,
  the timing trend, and the client-side best combo. Say when lines could not
  be measured, and state honestly when no summary arrived. The "again"
  action starts a new take.

No new API contract, streak, reward, leaderboard or qualification display,
and no invented numbers. Gates: focused Study and Karaoke tests, type check,
lint with story parity, the app, SSR and API suites, the Worker build, a
Storybook interaction and axe sweep of the Study and Karaoke stories, and
phone screenshots. Publish with `scripts/publish-main` under the owner's
standing authorization.

Published 2026-09-23 as Solid main 6b6ae424a6c74a968010eaa58b8e807046b27d70
(Radicle and GitHub, by `scripts/publish-main`).

A shared `ActivityResults` presentation drives both activities.

Study shows:
- accuracy, with Correct and Missed tiles from the server lesson state
- Continue back to the song and a quiet Study again
- no Karaoke button on the results screen
- the week strip only when the server reports a week; the fabricated
  fallback is gone

Karaoke replaces the frozen lyric with the server summary:
- score, lyrics accuracy, the timing trend ("Not scored" when timing did not
  count) and the client's best combo
- a note naming lines that could not be measured
- no score when no summary arrived or nothing was recognised

"Sing again" now rewinds to the start. Before, a new take began from the end
of the track. The e2e harness identifies completion by `[data-activity-results]`,
and the Karaoke journey waits for "Sing again". The streak page remains with
`rewards-activity-ui`.

Gates:
- `tsc` and the e2e typecheck are clean; lint and story parity ok; test
  discovery owned
- the app suite passed 1084 tests, SSR 25, API 249
- the Worker build passes
- a Storybook sweep of 50 Study and Karaoke stories passed every interaction
  with zero axe violations, after a scrollable-region fix on the Karaoke
  results
- `bun test` over studying and karaoke shows the same five Study
  browser-recorder failures as before the change (pre-existing, not
  introduced here)

Not run: the Study/Karaoke local browser harness, and staging.
