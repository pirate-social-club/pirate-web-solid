# Studying feature port — source manifest

Date: 2026-08-18. Lane: `study/storybook` (studying Storybook catalog).

## Sources

- Legacy React app (read-only): `/home/t42/Documents/pirate-workspace/web`,
  checkout SHA `0bc2ea7e8d427b5f5be8824d3943dad29c800f2c`.
- Karaoke lane worktree (read-only, app repo branch `karaoke/solid-port`):
  `/media/t42/codedrive/Code/pirate-workspace/.worktrees/pirate-web-solid/karaoke`,
  HEAD `be248c09032e96154a2c486d3d86274355c3422c`.

## Copied rows (framework-pure logic and components, adapted to Solid)

All ports are adaptations, not byte-identical copies: React hooks/JSX became
Solid signals/JSX, `ApiError` became a numeric status seam, and timers/network
moved behind injected interfaces. Source → port SHA-256:

| Port file | Source file | Source SHA-256 | Port SHA-256 |
| --- | --- | --- | --- |
| `studying-model.ts` | `web/src/app/authenticated-routes/study-route.tsx` + `web/src/components/compositions/song-study/song-study-surface.tsx` (pure helpers) | `050e3aceef12bef2b5fa54da198ce006f4ef625fc70cb55a78de4a9518c54355` / `c8b59251582963f46c67765b87aee73fa56427039d62a2e35cfff5d33954e585` | `53652f98f63e288828b4974f7fa8c3e83a66a9d0b927ee00f1ca88b46478a2cb` |
| `studying-model.test.ts` | `web/src/app/authenticated-routes/study-route.test.tsx` (behavioral cases re-expressed against the pure model) | `f618d4e58e0f4e5fa7207dcb56818c27d06fe2749c9aa6547eba6778dbe37b71` | `56265d58d43739eaff7b0a1801603b868cee15a56826218f74800e190d111c0d` |
| `studying-surface.tsx` | `web/src/components/compositions/song-study/song-study-surface.tsx` | `c8b59251582963f46c67765b87aee73fa56427039d62a2e35cfff5d33954e585` | `228e06de102ccdd1770b49884c4cddba47a50c4d8739070cdf00e34f0fd9d0c8` |
| `studying-route-view.tsx` | `web/src/app/authenticated-routes/study-route.tsx` (controller flow, minus Telegram handoff / feedback audio / MediaRecorder) | `050e3aceef12bef2b5fa54da198ce006f4ef625fc70cb55a78de4a9518c54355` | `130776ab710d523364261fb42677ed1b3e2ae8bd6ba7836a2060fadfa6efd665` |

Ported pure logic (evidence level: unit-tested parity — 24 focused tests in
`studying-model.test.ts` pass): `advanceLesson`, `exerciseSurface`,
`completeSurface`, `lockedSurface`, `toSayItBackExercise`,
`toMultipleChoiceExercise`, `formatNextReviewLabel`, `caughtUpMessage`,
`clampPercent`, `primaryActionLabel/Variant/Disabled`,
`previousStreakForAnimation`, `isStudyAttemptDivergence`,
`makeAttemptIdempotencyKey`, `STUDY_MAX_ATTEMPTS_PER_APPEARANCE`,
`STUDY_ATTEMPT_DIVERGENCE_STATUSES`, `STUDY_ATTEMPT_DIVERGENCE_RECOVERY_LIMIT`.

## Exact copy from the karaoke lane (app-original there)

| File | SHA-256 (source = port) |
| --- | --- |
| `src/features/activity/activity-progress-header.tsx` | `1ae30e3e88993adfdbeda12fc52af3e3fd36796e045d5bbe0f88adf0406d5b54` |

Source: karaoke worktree `src/features/activity/activity-progress-header.tsx`
at the HEAD recorded above. No legacy-React provenance; the karaoke lane
authored it as a reusable activity header.

## App-original rows (no copied source)

- `study-v2-api.ts`, `study-v2-api.test.ts` — generated api-next 0.38 Study
  availability, generation, session, exact choice, raw-audio answer, readback,
  and learner-audio deletion transport. The adapter is authored for this app,
  sends protected writes through the same-origin `/api` boundary with CSRF,
  and has no legacy application runtime source.
- `studying-route-model.ts` — client/recorder seam interfaces and auth-error
  helpers, modeled on the karaoke lane's route-model idiom but authored here.
- `studying-story-fixtures.ts` — Storybook fixtures (mirrors test shapes).
- `studying-surface.stories.tsx`, `studying-route-states.stories.tsx`,
  `studying-route-view.stories.tsx` — story catalog following the karaoke
  story idiom (docs descriptions, mocked clients, no network/mic/timers).
- `src/design-system.ts` — added re-exports only (`IconCaretLeft`,
  `IconMicrophone`, `IconCheckCircle`, `IconLock`, `IconArrowsClockwise`,
  `IconCrown`, `AuthRequiredRouteState`, `RouteLoadFailureState`,
  `RouteLoadingState`); no new design-system components.

## Deliberately excluded from the port

React-coupled legacy code that stays behind: MediaRecorder/getUserMedia
capture, Telegram voice-message handoff, feedback audio (AudioContext),
streak leaderboard/chip components, visibility-change refetch. Generated
Study v2 API wiring is now app-owned above; browser capture and the visual
controller migration remain excluded. See `docs/studying-storybook-audit.md`
for the full inventory.
