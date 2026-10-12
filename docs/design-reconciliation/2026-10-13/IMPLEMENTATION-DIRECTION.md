# Full Storybook reconciliation

## Recorded direction

In response to the question about releasing implementation from the 2026-10-11 Paper-only instruction, the workspace_owner said: "it doesn't have access to paper, it should fully update storybook properly". This direction releases the full Storybook reconciliation, starting with card and profile. It is not limited to slices 1a and 1b. The exported screenshots, captions, tokens and exact layout references are the cloud agent's design source.

This document records that direction on 2026-10-13. Its provenance is the coordinator session reply; no independently verifiable owner transcript is included in the repository. The original design export and independent audit remain unchanged. Existing shared component edits also change app source in the same commit. Storybook is the implementation review surface; there is no later duplicate implementation to copy into the app. Runtime rollout remains separately coordinated.

## Dispatch and ownership

The authoritative task is `solid-paper-storybook-reconciliation`, registered in the workstation control plane. Its exported record accompanies this document. The older `proposed-task-record.md` is a superseded narrow draft, not a second task to activate. The new record remains planned until actual cloud worktree admission succeeds. Registration on the workstation is not admission in the cloud container.

Use a new `feat/paper-storybook-reconciliation` branch from published main, initially `45d07cb25b3267ad16f158aa40eff7d11ad49c5e`. Preserve `ccr-1bb64139-1xpaas` at audit commit `f77c6871bd2ed6f2a13890997f106a9cffd18417` and the reference branch at `9c219817b915859398923d5ad56dd83afdedeb30`. If main advances, inspect the intervening changes before rebasing and record the actual base. Do not overwrite an already occupied feature branch.

Use the maintained cloud admission toolkit and the existing peer control root if it has already been initialized. The toolkit and verification procedure are published in [api-next issue 595](https://github.com/pirate-social-club/api-next/issues/595#issuecomment-6123047308). Verify actual repository roots, normalized remotes, shared Git directories and writer custody, register the exported planned record, and open its lane with the maintained lifecycle command. Do not copy workstation capacity exceptions into cloud runtime metadata or treat downloaded tools as completed admission.

The Storybook writer owns this feature branch, subject to the reserved-sheet boundaries below. Posting coverage belongs to the workstation `workspace_state_coverage_coordinator` under `solid-storybook-state-coverage-map`. This is a separate planned source lane. HNS/Spaces and feed-machine proposals in this package are reference material, not cloud dispatch; Specs 012 and 013 are not exported. Coordinate any later overlapping source change before editing it. Use the repository's sanctioned source-publication and review path. This task makes no production change, enables no Rewards and creates no credentials. API changes and runtime releases retain their own task ownership.

## Reserved sheets before implementation

| Design sheet | Source custody and treatment |
| --- | --- |
| `Flows/Community/JoinAndName` | Owned by `solid-hns-names-page-member-journey`, currently active, and its Naming/Karaoke integration. The capacity exception and review extend to 2026-10-16. Audit the export, mark source changes `owned_elsewhere`, and consume that lane's reviewed evidence. |
| `Flows/Community/Address` | Reserved to the existing naming/Spaces integration and `solid-spaces-community-route-attachment`. That attachment task is parked; owner recovery is separately planned and blocked on `solid-naming-karaoke-source-integration`. Parked or blocked status does not transfer source custody. |

Do not edit either flow's controllers, stories, strings or wiring in this exclusive Storybook lane until its owning lane records explicit handback. Keep both rows in the 95-sheet accounting with their owner and dependency. Audit-only review can proceed, and accepted evidence from the owning lane can close the corresponding reconciliation rows. Check shared primitive changes for effects on these flows and coordinate any overlapping source or behavioral change.

## Routine choices resolved

| Question | Direction |
| --- | --- |
| Card overflow | Match the 32px visual inside a 44px hit target without increasing the author row. Verify focus visibility and that adjacent targets do not overlap. |
| Post age | Use the compact Paper format, such as `2h`, preserving the existing timestamp source and localization. |
| Profile main label | Show the public handle first when available. Preserve an honest existing public-label fallback when absent; never expose an account identifier or fabricate a handle. |
| Song artist | Omit the line when the feed has no artist. Record the missing source; do not add a new API dependency merely to reproduce fixture text. |
| Duplicate card | Leave `FeedItemCard` and `HomeFeed` for a separate cleanup. A type-aware source trace at 45d07cb confirms neither is rendered by production routes; keep their live adapters. See `REVIEW-CORRECTIONS.md`. Implement and review the actual shared card used by routes. |
| Node | Configure the cloud task setup to use the CI-pinned Node 24.14.0, subject to checking current CI, and the repo-pinned browser tooling. Do not waive required acceptance because the initial container has Node 22. |

Apply the measured card and profile styles in the audit unless a current runtime or accessibility constraint requires a documented difference. Keep Boost as the live sponsor entry point. Keep the reward pill in design-system fixtures until a real capability/count projection and an authorized live destination exist. Use a discriminated presentation model for text, song and video; avoid optional field combinations that permit impossible card states.

The single profile feed uses the existing `posts` filter, newest-first ordering and cursor contract. Preserve identity, session, abort and stale-response protections. No invented community subtitle, `Get handle` destination or Settings-to-Edit rename belongs in the first tranche. A functional Edit slice can be implemented later when its contract and route are established.

## Work through the full catalogs

First implement the shared card with the video kind and the stateless fixture-only reward-pill primitive, then the single profile posts feed. Review the shared card on community, profile and public post routes. Existing generated video fields, projector, player, poster and signed playback provide the renderer; no new video wire type is needed.

Then extend the audit beyond the first slice. Use `DESIGN-INDEX.csv` to track all 95 sheets and inspect every relevant phone, desktop and state image against the actual rendered component. The other 65 sheets were matched by name only in the audit. Review them before choosing their implementation, rather than treating the existing table as proof of parity. Group work into small, reviewable tranches with source, behavioral and visual evidence.

Existing route-reachable components and their app stories change together. New stateless primitives belong in `packages/solid-ui`, with explicit presentation props and design-system stories. New app features require reviewed generated contracts and real production wiring in the same tranche. When a useful presentation preview precedes a contract, keep it in the design-system catalog with no invented wire interface, or use a specifically reviewed and reasoned app-preview exception. Do not use blanket parity allowlists or duplicate story-local screens as the implementation.

The current parity checker counts type-only imports as reachable. A green check therefore does not prove a component is rendered by a route. Verify actual runtime ownership and add meaningful interaction checks. Keep the checker intact; any correction to its semantics is a distinct scoped tooling change, not a way to excuse unreachable implementation.

## Dependencies and later tranches

| Area | Required treatment |
| --- | --- |
| Feed video delivery | The profile-activity and public-community-thread queries at API `4a791f27fb7c983689fe75150953be67ed25f709` restrict post types to text and song. The separate Home query permits ready videos; its line 403 is not an all-video exclusion. Request a separate api-next slice. Its eligibility must match the existing authoritative public playable-video policy; do not expose processing or unknown media as playable. Review the exact ready predicate with that lane. Pending author submissions stay distinct. |
| Video rollout | The video renderer must be serving and verified in an environment before that environment's API starts returning videos. Merge order alone is insufficient. Verify staging first through the separate release lane. |
| Study answers | Correct answers advance automatically. Only incorrect answers pause for Continue. Review both spoken and choice paths. Result-page Continue is a different transition. |
| Result sequence | Always show the activity result, then optional newly-earned Streak, then optional Rewards. `qualifiedToday` alone does not establish that this attempt newly earned the day. Resolve adapter data before asserting live routing. |
| Streaks and leaderboards | Coordinate with `rewards-activity-ui`. Existing leaderboard endpoints do not supply seven daily marks or a newly-earned signal. Do not invent those wire fields. |
| Karaoke disclosure | Preserve the approved disclosure. Trace provider policy/serializer compatibility separately from platform storage and deletion. Provider `not_stored` and platform retention are separate facts. No new terms-review gate is established by the audit. |
| Comments | One-level display, old-depth flattening and newest-first top-level pagination need reviewed server semantics. Replies remain oldest first. There is no comment-vote endpoint. Record any remaining Reply-action placement decision before behavior changes. |
| Notifications and footer | Implement the fifth tab with a functioning Notifications slice and reviewed stored/read/unread contract. Linking the unavailable placeholder is not completion. Preserve four live tabs until then. |
| Wallet Send and Claim | Verification purpose, server enforcement, intended operation return and unknown-write reconciliation need contracts and state review. A visual palm prompt does not enforce the rule. |
| Reward results | Keep presentation fixtures while Rewards is off. Resolve entry-status access and existing-entry-plus-new-cash behavior. Timeout is not evidence of no reward. No live enablement is authorized here. |
| Dance | Do not start new Dance code until amendment items A to F are resolved, conforming specifications are ratified and the required second independent review is complete. The full Storybook direction does not settle eligibility, verification timing, daily participation or review semantics. |

A dependency blocks its affected tranche, not unrelated settled work. Complete the available work and maintain an actionable dependency list. Do not report full parity while a sheet is merely mapped by name, mocked in an unreachable duplicate, or waiting on an unresolved rule.

## Acceptance and reporting

Run appropriate focused tests first, then required type/lint/unit, app and design-system Storybook builds, interaction/accessibility checks, Worker build, SSR/hydration and generated-client provenance checks on the actual reconciled source under Node 24 or newer. Include relevant session/CSRF and dependency checks for changed behavior. Do not rerun unrelated broad suites without a reason.

Validate real video playback when the renderer is integrated; fixture images do not establish signed delivery, seek, reload or session behavior. Record whether that validation was local or on a serving environment, its exact source and its limits. Do not claim staging acceptance from an isolated Storybook fixture.

For every tranche record the files and routes affected, exact source, design references, measured differences, transition evidence, checks and unresolved dependencies. The full sheet table must distinguish visual review, interaction evidence and live contract availability. The task is complete only when all authorized implementable work is reviewed and preserved, and any truly blocked remainder is clearly recorded rather than labeled complete.
