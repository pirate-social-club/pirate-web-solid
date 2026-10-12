id: rewards-activity-ui
title: Build the Solid activity qualification, streak, and leaderboard experience
status: planned
repository: pirate-web-solid
area: rewards
parent:
priority: unranked
worktree:
branch: m4/rewards-activity-ui
owner_role: Solid rewards activity UI writer
coordination: parallel-safe
blocked_by: solid-study-runtime-integration
updated: 2026-08-29
closed_at:
review_after: 2026-09-12

Implement the standalone Solid first-slice experience for Study and Karaoke
attempts, evidence submission, qualification state, song and community
streaks, persona-only leaderboard views, private account standing, and the
presenting-persona control described by spec 015.

The lane may perform read-only design and test reconnaissance while the
backend task is open, but contract-dependent mutation waits for reviewed,
generated api-next qualification contracts. Runtime code must use the
generated client through the same-origin authenticated `/api` path and
preserve the repository session and CSRF boundary. It may not extend the
handwritten staging Karaoke adapter, invent request or response types,
compute or submit a settlement score in the browser, import legacy or React
runtime code, or expose private account, sibling-persona, wallet, evidence,
or reward-ledger facts on public surfaces.

This task owns no reward money, Earn-sheet asset or bounty UI, Megapot,
community token, Dance, deployment, secret, or provider change. Dance remains
absent until a producer is separately specified and implemented. Gates are
focused feature and contract tests followed by the Solid type, lint, unit,
API-boundary, application, Worker build, product-graph, SSR/hydration,
session/CSRF, api-next client-provenance, Solid runtime, dependency, and diff
checks required by the repository `AGENTS.md`. No push, pull request,
deployment, provider mutation, or external-state change is authorized.

Design-readiness checkpoint — 2026-08-25. The product dependencies are
complete. The designer handoff and its two reusable prompts now distinguish
public shared-ticket states from the authenticated sponsor-only
`fallback_active`, `fallback_displaced`, and `fallback_won` states; require
"Fund with USDC" wording; and state that Pirate is the buyer and NFT custodian.
They also retain external fallback behind referral decision 11 and counsel
sign-off. The handoff SHA-256 is
`21f34d94c60797a8ae798abd7d269891c3ac722f611118b8b865824bc2fc357b`; the
prompt file SHA-256 is
`cb78f61fbecb5f7f440205bbd5abbcccf45f6d14bd8546c60d997376ecda3c77`.

This implementation lane remains the no-money slice recorded above. It may
use the corrected handoff for activity rows, qualification results, streaks,
presenting-persona control, and leaderboards, but must not implement the bonus,
funding, community-token, Megapot, or Dance designs. One Solid capacity slot is
free after retirement of the completed community-route worktree. Dispatch is
still blocked by active uncommitted state in the canonical Solid checkout; the
coordinator must not preserve, discard, or overwrite those paths from this
task.

Study-ownership amendment — 2026-08-28. Spec 018 and
`solid-study-runtime-integration` now own Study exercise availability, prompts,
microphone capture, submissions, retry/spent state, feedback, and session
rendering. This task retains shared activity qualification, reward, streak,
leaderboard, and presenting-persona surfaces and may compose the accepted Study
runtime after that dependency lands. It may not extend the fixture-only Study
wire model or create a competing exercise renderer.

Karaoke-runtime amendment — 2026-08-29. Spec 019 and the backend Karaoke tasks
own readiness, attempt creation, realtime scoring, qualification v2, and the
generated wire shapes. This lane consumes `/karaoke/attempts`, replaces the
handwritten staging adapter, renders `playback_audio` and stable Karaoke line
ids, nudges headphones without enabling voice-call DSP, and treats recording
state as private learning state independent from score or reward. It never
computes a settlement score or infers readiness from a new post-card boolean.
