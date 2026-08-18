# Studying Storybook lane — legacy audit

Date: 2026-08-18. Source (read-only): `/home/t42/Documents/pirate-workspace/web`
(legacy React app) at checkout `0bc2ea7e8d427b5f5be8824d3943dad29c800f2c`.

## Where the feature lives

- `src/components/compositions/song-study/song-study-surface.tsx` (688 lines) —
  the presentational activity surface. Discriminated-union `SongStudySurfaceState`
  drives everything; the component holds no business logic beyond footer
  label/variant/disabled derivation and a streak slot-number animation.
- `src/components/compositions/song-study/song-streak-*.tsx` — streak chip,
  leaderboard, preview, shared entry-list parts (used on the completion state
  and on post/feed surfaces).
- `src/app/authenticated-routes/study-route.tsx` (1255 lines) — the route
  controller: loading/auth/locked/blocked/error phases, exercise queue,
  attempt submission, idempotency keys, divergence recovery, Telegram voice
  handoff, MediaRecorder capture, feedback audio.
- `src/app/authenticated-routes/study-route.test.tsx` (1303 lines) — page-level
  behavioral tests (bun:test, mocked API), not pure-function unit tests.

## State inventory

Route phases (`StudyRouteState`):

- `loading` — initial payload fetch.
- `auth_required` — study pack is member-only; sign-in gate, no public fallback.
- `locked` — study pack exists but the song is not owned; footer CTA "Buy {price}".
- `ready` — lesson running; owns `exerciseQueue`, `presentationCounts`,
  `correctCount`, `lastAttemptResult`, and the current `surface`.
- `blocked` — e.g. age verification required before the lesson may start.
- `verification_required` — proof-of-personhood gate variant.
- `error` — unrecoverable load failure.

Surface states (`SongStudySurfaceState`):

- `locked` — icon + copy, optional `priceLabel`.
- `say_it_back` — phases `idle | listening | checking | wrong`; per-appearance
  attempt cap (`STUDY_MAX_ATTEMPTS_PER_APPEARANCE = 2`); `wrong` splits into
  retryable (muted, "Not quite — try again", footer "Record") and spent
  (`revealReference`, destructive, "Let's come back to this" / "Let's keep
  going" via `willReturn`, footer "Continue"); shows `heardTranscript`
  ("Heard: …") and `submitError` / `guidance` lines.
- `multiple_choice` — `submitting`, `result: correct | wrong`,
  `selectedOptionId`, `canRetry`, `submitError`. The server withholds
  `correctOptionId` until an attempt lands; the attempt response discloses it
  for reveal styling. A correct answer auto-advances after ~700 ms.
- `complete` — `scorePercent` (clamped 0–100), `correctCount/totalCount`,
  optional `streak` (`currentStreak`, `qualifiedToday`, today counts/target),
  `previousStreak` (only for the slot-number animation), `nextReviewLabel`,
  and a post-completion server-ranked streak summary (never the pre-session
  snapshot). Reward slot renders below the header on completion, inline in the
  header capsule otherwise.

## Transitions and scoring

`advanceLesson(state, outcome)` (framework-pure):

- Correct first-pass (`attemptNumber === 1`) increments the local correct
  count; a server `first_pass_correct_count` overrides it when present.
- Wrong requeues the card with 1–3 intervening prompts
  (`remaining.splice(Math.min(3, remaining.length), 0, currentIndex)`) only
  when other cards remain, `attempts_remaining > 0`, and the session is still
  active — otherwise the lesson ends and the card stays due for a future
  session (this is the loop the per-appearance cap prevents).
- Completion when the server session status is not `active` or the queue
  drains; `completeSurface` computes `scorePercent = correct/total * 100`
  (0 when empty) and maps snake_case `study_progress` into the streak shape.
- `presentationCounts` track the max attempt number per exercise so re-queued
  cards resume at the right attempt.
- Attempt integrity: idempotency key `study:{session}:{exercise}:{attempt}:{uuid}`;
  divergence = API error status ∈ {400, 404, 409}, recovered by reloading the
  session at most twice.
- `formatNextReviewLabel(nextDueAt)`: soon / in N min / in N hr / tomorrow /
  in N days / date.

## Reward surfaces

- Header capsule: progress bar runs into the reward amount pill (compact
  campaign pill for the active song campaign).
- Completion: fire/trophy hero, streak slot-number roll (450 ms delay,
  1200 ms slide, reduced-motion aware), first-pass score, top-3 leaderboard
  plus a pinned viewer row when the viewer qualified but is off-podium.

## Framework-pure vs React-coupled

Portable (ported into `src/features/studying/studying-model.ts`):

- `STUDY_MAX_ATTEMPTS_PER_APPEARANCE`, divergence status set/recovery limit.
- `advanceLesson`, `exerciseSurface`, `completeSurface`, `lockedSurface`,
  `toSayItBackExercise`, `toMultipleChoiceExercise`, `formatNextReviewLabel`,
  `caughtUpMessage`, `clampPercent`, `primaryActionLabel/Variant/Disabled`,
  `previousStreakForAnimation`, `isStudyAttemptDivergence` (adapted to take a
  numeric status instead of `ApiError`), `makeAttemptIdempotencyKey`.

React-coupled, deliberately not ported in this lane:

- MediaRecorder/getUserMedia capture and the Telegram voice-message handoff.
- Feedback audio (AudioContext buffers, unlock-on-gesture).
- API client calls, device timezone, visibility-change refetch, streak
  leaderboard fetching, navigation/history replacement.
- Streak leaderboard/chip/preview components (React + `@pirate/api-contracts`
  types); the completion state keeps the streak hero and drops the board for
  now — see "Design-system gaps" in the lane report.

## Fidelity notes

- Surface copy, footer label/variant/disabled mapping, wrong-state styling
  split (muted retry vs destructive spent), and reveal styling are ported 1:1.
- The legacy header merges progress + reward into one capsule; the Solid lane
  reuses the karaoke lane's `ActivityProgressHeader`, which already implements
  that capsule (progress bar + reward label pill).
- Icons: the legacy uses phosphor `BookOpen/SpeakerHigh/Stop/XCircle/Trophy/
  GraduationCap/ArrowCounterClockwise`; the app design system does not export
  these, so the port maps to the nearest exported icons (IconLock,
  IconMicrophone, IconSquare, IconX, IconCrown, IconArrowsClockwise) and flags
  the gap.
- The MC auto-advance delay (700 ms) is injected as a scheduler seam so
  stories/tests stay deterministic.
