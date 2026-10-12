id: solid-storybook-state-coverage-map
title: Register state coverage across app stories and transition tests
status: planned
repository: pirate-web-solid
area: media
parent: solid-storybook-app-parity-check
priority: normal
worktree:
branch: chore/storybook-state-coverage-map
owner_role: integration coordinator
coordination: exclusive
blocked_by:
updated: 2026-09-30
closed_at:
review_after: 2026-10-07

Keep this planned follow-up separate from source stamps and the blocked
staging release, as agreed with the workspace_owner on 2026-09-30. The existing
parity check establishes production import reachability; it does not enumerate
runtime states or prove deployed behavior. Composer states currently have
handwritten stories. Clocked guide-audio fixtures cover screens and recovery,
not real media-element timing or device synchronization.

Start with the video composer: inventory user-visible capture and submission
states, map each to a story and meaningful transition test, and fail CI on
missing coverage. Prefer a small exhaustive typed map over a new framework or
rewriting feature state machines. Record intentional exceptions with reasons.
Broaden coverage after the first mapping is useful and reviewed. Shared app
and story behavioral checks and Pixel media tests remain separate evidence.

This is registration only. No worktree, source change, build, publication,
deployment or device interaction has begun. It is not a gate for the already
approved a955041 release.
