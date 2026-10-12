id: solid-paper-storybook-reconciliation
title: Reconcile the full Paper design with both Solid Storybook catalogs
status: planned
repository: pirate-web-solid
area: platform
parent: solid-paper-cloud-handoff-publication
priority: high
worktree:
branch: feat/paper-storybook-reconciliation
owner_role: cloud_storybook_implementer
coordination: exclusive
blocked_by:
updated: 2026-10-13
closed_at:
review_after: 2026-10-27

The workspace_owner explicitly releases Storybook implementation from the
earlier Paper-only restriction: "it doesn't have access to paper, it should
fully update storybook properly". Reconcile the full app and design-system
catalogs from the exported references. Card and profile are the first tranche,
not the complete scope. This is the authoritative successor to the unregistered
narrow proposed-task-record.md. It does not ratify unresolved Dance rules or
supply missing API contracts.

The immutable reference branch handoff/paper-storybook-20261012 is at
9c219817b915859398923d5ad56dd83afdedeb30. The independent cloud audit branch
ccr-1bb64139-1xpaas is at f77c6871bd2ed6f2a13890997f106a9cffd18417.
Both are based on Solid main 45d07cb25b3267ad16f158aa40eff7d11ad49c5e.
Start a fresh feat/paper-storybook-reconciliation lane from published main,
inspect any newer changes, and preserve both evidence branches.

This registration is planned. No product worktree is admitted or source work
begun here. The workstation coordinator may assemble and publish supplemental
direction documents on handoff/storybook-implementation-20261013 using a
temporary index and role-only commit metadata, preserving canonical Solid
HEAD, index, files and existing refs. That documents-only branch is not the
feature worktree. Actual cloud implementation requires the maintained peer
control-plane registration and worktree admission against the real container
repositories. Record actual cloud custody and source before activation.

First extend the real shared CommunityPostCard to render typed text, song and
video, preserving vote/comment/report/age/permission behavior on its three
live routes. Keep Boost live. Place a stateless reward-pill primitive and
explicit fixtures in packages/solid-ui; no fake live activity count or money
behavior. Then implement one profile posts feed through the existing posts
filter, keeping session, identity, pagination, abort and stale-response guards.

Work through all 95 design sheets in reviewable tranches. Existing shared
components and stories change together. New app features require reviewed
generated contracts and production wiring, or a specific reviewed preview
exception. No blanket allowlist, duplicate story-local implementation,
invented wire interface or claim of reachability from a type-only import.
Record implemented, intentional differences and blocked sheets separately,
with real rendered visual and behavioral evidence rather than title matches.

The direction document resolves routine first-tranche choices: 32px overflow
visual inside a non-overlapping 44px target; compact age; public handle first
with an honest public fallback; omitted absent artist; duplicate card cleanup
separate; cloud Node matching current CI's 24.14.0 baseline. Unsupported
subtitle/destinations remain absent until functional contracts and routes exist.

Coordinate streaks and leaderboards with rewards-activity-ui. Do not adopt
solid-storybook-state-coverage-map as this lane's record; it remains the
separately owned video-first coverage follow-up. HNS/Spaces machine planning
must not race existing naming or owner-recovery source lanes. API changes,
runtime releases, deployment, Rewards enablement, credentials and live chain
actions are outside this source task. The video API query change needs a
separate api-next task and must not serve videos before the renderer is live
and verified in the same environment. Dance waits for A to F, ratification
and second independent review before any new Dance implementation.

Use focused tests, applicable type/lint/unit, both Storybook builds,
interaction/accessibility, Worker build, SSR/hydration, generated-client
provenance and relevant session/CSRF/dependency checks under Node 24 or newer.
Real video playback and deployed acceptance are distinct from fixtures and
must be recorded honestly. Preserve exact source and evidence per tranche,
use the sanctioned publication route, and keep the task open until the work
and any genuine dependencies are correctly dispositioned.
