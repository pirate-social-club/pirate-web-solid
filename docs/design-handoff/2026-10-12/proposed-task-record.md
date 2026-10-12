id: solid-paper-post-card-profile-reconciliation
title: Reconcile shared post cards and the single profile posts feed
status: planned
repository: pirate-web-solid
area: media
parent:
priority: normal
worktree:
branch: feat/paper-post-card-profile-reconciliation
owner_role: Solid UI reconciliation writer
coordination: exclusive
blocked_by:
updated: 2026-10-12
closed_at:
review_after: 2026-10-26

This is a draft for coordinator registration, not an authoritative task record.
Do not dispatch from the copy in the export package. Before registration and
implementation, record the owner instruction that releases this narrow slice
from the reported Paper-only restriction. The current turn authorizes design
export and brief preparation.

Use the portable package handoffs/paper-cloud-storybook-handoff-2026-10-12
and its BRIEF.md. Reference Solid source is
45d07cb25b3267ad16f158aa40eff7d11ad49c5e. Recheck source and instructions
at dispatch. No Paper access is required.

The scope is the existing shared post card and profile activity presentation:
add the video kind using existing generated reads, reuse the card for the
community and profile, and replace profile tabs with one posts feed. Preserve
permissions, age gates, authenticated requests, durable engagement behavior,
pagination and stale-response protection. Add the stateless reward-pill
primitive and design-system stories with explicit fixtures; it stays absent
from live feeds until a real capability/count projection and authorized reward
surface exist. Rewards remain disabled.

Existing component changes and their actual-component app stories ship in the
same source commit. The new reward primitive uses packages/solid-ui stories.
Keep the production-import parity gate intact. No blanket allowlist exception,
story-local substitute component, invented wire type or fake live reward count
is authorized by this proposed scope.

This lane excludes comment ordering/depth/voting, profile Edit, Notifications,
the fifth navigation tab, Study/Karaoke completion or disclosure changes,
streaks, leaderboards, wallet verification, Dance, API changes, activation,
credentials, deployment and funded actions. New contract dependencies go back
to their owning task. Later work reconciles with rewards-activity-ui and the
two Dance records; solid-storybook-state-coverage-map is a separate
video-composer-first registration.

Acceptance requires phone/desktop comparison of real components, meaningful
video projection and profile pagination/stale-response checks, retained
engagement and permission behavior, focused tests, repository type/lint/parity
gates, Storybook build and scoped interaction/accessibility checks, applicable
Worker/SSR/hydration and API-provenance checks, exact source evidence and
recorded outcomes. Follow current repository lane, review and publication
policy; this unregistered draft does not enlarge standing task authority.
