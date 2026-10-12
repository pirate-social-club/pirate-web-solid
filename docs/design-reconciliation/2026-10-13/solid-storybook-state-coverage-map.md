id: solid-storybook-state-coverage-map
title: Register state coverage across app stories and transition tests
status: planned
repository: pirate-web-solid
area: media
parent: solid-storybook-app-parity-check
priority: normal
worktree:
branch: chore/storybook-state-coverage-map
owner_role: workspace_state_coverage_coordinator
coordination: exclusive
blocked_by:
updated: 2026-10-13
closed_at:
review_after: 2026-10-27

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

## Workstation ownership and posting-first review, 2026-10-13

The workspace_owner's review identifies the missing dispatch and recommends
posting coverage first. This record now explicitly owns that work, with the
workstation workspace_state_coverage_coordinator as its accountable executor.
The cloud Storybook implementer does not own this machine-review lane. Keep
Spec 012 and Spec 013-dependent work on the workstation, where their accepted
amendments are available; the cloud export lacks those specifications.

The state-machine plan on handoff/storybook-implementation-20261013 is bound
to this record only for posting coverage. HNS/Spaces and feed sections are
reference proposals, not dispatch for those lanes. Preserve the active naming
writer, the Spaces owner-recovery dependency and the separately owned cloud
Storybook source. No competing controller refactor is authorized.

Read-only source review at 45d07cb25b3267ad16f158aa40eff7d11ad49c5e finds
that video-composer-coverage.test.ts already inventories every one of the 17
composer state paths, with actual story exports or internal-state reasons and
named transition-test fragments. The pilot landed this map after the original
registration. Reuse and review it rather than creating a second registry.
Source comparison confirms the state keys and referenced story exports match;
no test execution, rendered story or device acceptance is claimed here.

First review the existing video map's internal-state reasons, transition
assertions and CI discovery. Then map the six text actor states and nine song
observer states to their real visible projections, stories and meaningful
transition tests. Preserve accepted v1 actor lifetimes and retained operation
identities. Do not add a framework, storage or another actor merely to fill a
coverage row. Keep machine-internal states separate from server outcomes.

The first read-only baseline and route trace are published with the corrected
handoff as POSTING-COVERAGE-BASELINE.md and source-review.json. Documentation
may be assembled in the existing named staging package and published on the
handoff branch using a temporary index, without a mutable product checkout.
Source implementation remains planned and requires its own governed worktree
admission before editing; no product worktree is admitted by this review.
Update this record with actual source and verification when that step begins.
