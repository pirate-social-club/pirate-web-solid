id: solid-paper-boost-story-overflow-20261015
title: Follow the accepted post overflow into the existing Boost dialog story
status: planned
repository: pirate-web-solid
area: platform
parent: solid-paper-production-release-20261015
priority: high
worktree:
branch: fix/paper-boost-story-overflow-20261015
owner_role: cloud_storybook_implementer
coordination: exclusive
blocked_by:
updated: 2026-10-15
closed_at:
review_after: 2026-10-22

The workspace_owner instructed the coordinator to start the remaining Paper work on fresh branches after the accepted release and held Storybook integrations. PR69 explicitly deferred the existing functional Boost story until PR60 replaced the live Song actions trigger with the shared post overflow. That prerequisite is now serving in production and accepted on main. This is a bounded source successor to the existing Paper reconciliation lane, not a new design ruling.

The existing cloud Paper writer retains implementation custody. The release coordinator prepares a fresh remote implementation branch and a source-bound handoff after PR69 and PR75; a branch alone is not an active cloud checkout. The writer must perform its maintained cloud registration and worktree admission before editing. Start the fresh branch from the accepted main after PR69 and PR75. Change only src/features/rewards/reward-sponsor-dialog.stories.tsx and necessary focused story evidence to use the current real shared overflow/card entry for Boost. Preserve the existing controlled wallet/API fixtures, journal, funding flow and explicit no-funds description. Add meaningful story interaction for opening the post menu and dialog and closing it. Do not add a local imitation of the production component, new API contracts, feature flags, dependencies or any live funding or production deployment. Keep unresolved owner design choices and the separate production Rewards capability problem open.

Run the focused applicable story/parity/type checks, the browser story interaction/accessibility check and required repository checks. The assigned writer publishes a named feature branch and protected PR with exact source and validation. The coordinator must not claim this handoff launched a cloud session or completed implementation. This task starts one unambiguous remaining Paper item; it does not claim the95-sheet reconciliation is complete or take over naming, Spaces, Dance or financial activation.
