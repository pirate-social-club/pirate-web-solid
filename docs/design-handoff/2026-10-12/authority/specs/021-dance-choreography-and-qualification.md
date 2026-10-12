# Dance choreography and qualification

## Song-reference master authority — 2026-09-08

Spec 013 §5A's Gate A ratification replaces the captured-audio artifact for
`song_reference` with the verified canonical-replacement master. Wherever this
spec consumes a published song-reference video's immutable object, hash or
soundtrack, it consumes that same accepted `video_render_revision` and master,
never the private source. The canonical song and audio revision remain frozen.
Render sample accounting does not prove camera/guide alignment or satisfy this
spec's separate segment-alignment and qualification evidence. This conforming
identity change activates no Dance consumer, grading, reward or live operation.

> Monetary eligibility clarification — 2026-09-06: Spec 015 §8.1 requires
> independent human verification for all monetary activity benefits. Unverified
> accounts may participate and retain nonmonetary results, but receive no pool
> share, asset-bonus claim or community-token credit. A verified nonmember may
> qualify for money without gaining posting authority. Existing money/provider
> admission gates and Spec 006's limited uniqueness claims remain in force.

> Participation/posting correction — ratified 2026-09-06: Spec 006 §3A separates
> Study, Karaoke and Dance participation from community posting eligibility.
> Community verification and active membership are not activity prerequisites.
> Exact-community persona ownership remains required, with an explicit ungated
> preparation path under Spec 014 §11.2. This supersedes the membership-required
> part of the 2026-09-03 activity/persona amendment, not its privacy boundary.

Status: ratified specification checkpoint — 2026-08-30. Owner:
workspace_owner through the coordinator. This specification consumes the
ordered prerequisite amendments ratified in the same authority chain and
authorizes specification and successor task planning only. It authorizes no
runtime, migration, generated contract, provider, deployment, public-media,
registry admission, qualification production, or money change.

> Renumbering and reconciliation note — 2026-08-30: This draft was staged as
> Spec 016 and then 017. Ratified specs now occupy 016 through 020, so Dance is
> ratified as Spec 021. This revision updates self-references, consumes the
> asset-bonus, song-owner, and video-track prerequisites, and makes
> decoded-timeline, visibility, subject-continuity, and replay-fingerprint
> behavior explicit. It does not choose a provider, calibration floor, or
> admission target.

> Video reference-supply amendment — 2026-09-02: Dance production reference
> supply consists only of published, public videos whose immutable Spec 013
> intent is `song_reference` to the exact published canonical song and
> `audio_revision`. An `original_audio` video is never Dance reference supply,
> regardless of its ACR result, popularity, or moderator outcome. Phase 7
> shadow grading remains independently startable with deterministic fixtures;
> the video runtime gates production authority resolution, not shadow work.

> Product closure — 2026-08-25: A Dance choreography binds one immutable
> 6–30 second scored song segment to one immutable choreography revision.
> The choreographer chooses the excerpt; the server extracts it from the
> canonical song audio and verifies the reference video's alignment. The
> dancer selects one revision before recording, and the server grades only
> against that revision. Six seconds is a duration floor, not an automatic
> pass: body coverage, meaningful motion, alignment, integrity, and admitted
> calibration gates still apply. Rewards remain attached to song reward
> terms, never to the choreography aggregate.

## 0. Scope, precedence, and non-goals

This spec owns:

- immutable Dance song segments and their canonical extracted audio;
- choreography aggregates, revisions, reference processing, and featured
  presentation;
- the private Dance session, consent, upload, attempt, and cleanup machines;
- the provider-neutral Dance reference processor and grader ports;
- Dance calibration, admission, evidence, and qualification production;
- the Dance-specific bridge into Spec 015 streak and reward consumers;
- Dance privacy, integrity, recovery, storage, wire projections, sequencing,
  and acceptance.

The following authorities remain in force:

- Spec 013 owns Post creation and canonical song and audio identity. Its dated
  §1.1 song-owner/owner-policy and §5A video-track amendments own
  `song_reference`, the song-owner principal, owner-policy revisions, and the
  `derivative_video` publication gate consumed here.
- Spec 007 owns sealed media hashes, private media storage, transform
  capabilities, soundtrack alignment adapters, and provider-attempt
  responsibility patterns. Its Dance capability amendment must land before
  reference processing begins.
- Spec 008 §3A owns typed original-versus-derivative registration intents,
  parent resolution, and revenue-share facts.
- Spec 015 owns `activity_qualifications`, account-scoped reward identity,
  streaks, offer legs, pool shares, emissions, eligibility, compliance, and
  every money invariant.
- Spec 014 owns the private account, public persona, wallet, projection, and
  cache boundary.
- Spec 006 limits integrity and liveness claims. A session-specific gesture
  is replay friction, not proof of a unique person or live human.
- Specs 000 and 004 own pure-reducer, idempotency, effect-journal,
  uncertainty, recovery, and money boundaries where the later authorities
  above do not narrow them.

The legacy Dance specification, migrations, service, Telegram binding, D1
tables, provisional calibration, and draft boosts design are evidence only.
They are not target schema or runtime authority. In particular, legacy stored
only `reference_duration_ms`; it never stored a song-timeline start or end,
never admitted Dance to a reward enum, and never admitted a numeric Dance
money floor.

The following are non-goals for this checkpoint:

- freestyle qualification from song presence, beat alignment, or generic
  motion;
- a choreography challenge or bounty before a ready choreography exists;
- grading several routines and selecting the best score;
- an `official_only` publication policy or any second permission enum beside
  Spec 013's `derivative_video`;
- Telegram routes, identifiers, file APIs, or capture modes;
- browser liveness claims, biometric identity, face recognition, group
  choreography, or continuous-camera attestation;
- publishing a private grading attempt, retaining it for model training, or
  raw-video dispute review;
- a Dance upload inside the song creation bundle, which remains primary-audio
  only;
- a provider choice, production floor, deployment, or money activation.

## 1. Decision summary

1. A choreography's movement target and song excerpt are authored together.
   The choreographer chooses integer song-timeline bounds. The server, not the
   reference video's soundtrack, creates the canonical segment bytes.
2. The scored interval is the half-open song range `[start_ms, end_ms)` with
   `6000 <= end_ms - start_ms <= 30000`. Countdown, framing, and start-cue
   lead-in sit outside it. Source or reference time-stretching is forbidden.
3. A choreography is a sibling aggregate with its own creator and revisions,
   not a song enrichment row and not song-bundle content. Its public reference
   video is a separate video Post carrying `song_reference`.
4. The dated Spec 013 amendment owns and defines the current
   `derivative_video: allowed | owner_only | blocked` policy and its license
   mapping. Spec 021 consumes the captured revision and hash; it does not
   define a second publication policy. Publication permission never
   authorizes money.
5. The dancer selects exactly one ready choreography revision before capture.
   Session creation freezes that revision, its segment, audio revision,
   scoring contract, calibration, admission state, and start-cue policy.
6. Only a server finalization reducer over authenticated, immutable grader
   evidence may create a Dance result or qualification. Browser scores,
   provider callbacks, Workflow state, and reward terms are not truth.
7. Calibration advances prospectively through
   `shadow -> streak_admitted -> money_admitted`. Shadow creates private
   diagnostics only. Streak admission creates qualifications and streaks but
   no funded effect. Money admission permits only future sessions under
   explicit compatible reward terms.
8. Every admitted policy freezes a numeric `platform_floor_bps`,
   `calibration_version_id`, calibration checksum, and scorer/model/schema
   versions. No legacy `7000` value transfers to Dance.
9. Rewards attach to the song offer leg or community program. Before capture,
   a reward-capable session freezes the exact compatible objectives it may
   satisfy. Each Dance-aware objective chooses `any_policy_accepted` or one
   exact choreography revision. The mutable featured presentation is never an
   eligibility selector.
10. Featured or official status affects attribution, ordering, and default UX
    only. It does not grant exclusivity, change a score, create a
    qualification, or authorize a reward.

## 2. Identity and authority chain

Every Dance decision resolves through one immutable chain:

```text
song post_id + audio_revision
  -> dance_song_segment
  -> dance_choreography_revision + aligned reference artifact
  -> dance_session + one private upload + one selected revision
  -> authenticated Dance grader evidence
  -> Dance finalization reducer
  -> optional activity_qualification
  -> streak and, only when money-admitted, matching Spec 015 consumers
```

No later link may replace an earlier identity. In particular:

- soundtrack audio in a reference or attempt video is evidence for
  alignment, not the canonical song segment;
- an active-revision pointer or featured pointer cannot rewrite a session;
- a provider result cannot choose a choreography, floor, calibration, or
  reward objective;
- a reward objective cannot change a choreography's segment or grader;
- a persona presents the performer publicly, while the account remains the
  private uniqueness and reward identity.

## 3. Canonical song segments

### 3.1 Aggregate

`dance_song_segments` contains immutable rows with:

- `segment_id`, server-derived from the canonical identity;
- `song_post_id`, `audio_revision`;
- integer `start_ms`, `end_ms`, and derived `duration_ms`;
- private `canonical_segment_audio_ref`;
- server-computed `canonical_segment_sha256`;
- `extraction_policy_version`, `source_media_sha256`, `created_at`;
- an immutable `segment_terms_hash` over every field above.

The scored song range is half-open: it includes `start_ms` and excludes
`end_ms`. Constraints require:

```text
0 <= start_ms < end_ms <= canonical_audio_duration_ms
6000 <= end_ms - start_ms <= 30000
duration_ms = end_ms - start_ms
```

Identity is unique over `(song_post_id, audio_revision, start_ms, end_ms,
canonical_segment_sha256, extraction_policy_version)`. Exact creation replay
returns the existing row. A hash or bound disagreement is a conflict, never a
new interpretation of that `segment_id`.

The server extracts the exact interval from Spec 013's sealed canonical audio
through the Spec 007 transform port. It does not extract authoritative bytes
from a video's soundtrack. Resampling needed for the grader uses a frozen,
deterministic extraction profile and records both source and output hashes. It
must not alter playback tempo or stretch either timeline.

### 3.2 Excerpt choice

The choreography author chooses `start_ms` and `end_ms` when creating the
revision because the excerpt and movement phrase are one authored target. The
UI may offer waveform, beat, lyric, or video-alignment assistance, but those
are selection aids; submitted integer bounds and the resulting canonical
segment are the authority.

The same rule applies when the song owner publishes a featured reference
dance. A rewarder selecting an existing choreography inherits its exact
segment and cannot move the bounds. A rewarder that wants an excerpt for which
no ready routine exists is requesting a future choreography challenge; v1
does not create or activate a performance reward for it.

The song's license preset and owner policy decide whether a reference video
may be published. They never choose the excerpt.

## 4. Choreography aggregate and reference processing

### 4.1 Aggregate and revisions

`dance_choreographies` is keyed by `choreography_id` and records:

- `song_post_id` and the private `creator_account_id`;
- public `creator_persona_id`;
- `status IN (draft | processing | ready | disabled | retired)`;
- `active_revision`, `created_at`, `disabled_at`, `retired_at`.

`dance_choreography_revisions` is keyed by
`(choreography_id, revision)` and records:

- `segment_id`, `audio_revision`, `reference_video_post_id`;
- `status IN (processing | ready | processing_failed | disabled | retired)`;
- immutable reference-video object identity and server SHA-256;
- `reference_video_scored_start_ms` and
  `reference_video_scored_end_ms`, mapping the song segment onto the video;
- alignment policy, adapter, revision, confidence metrics, drift metrics,
  result digest, and private evidence reference;
- reference duration, dimensions, frame rate, and usable-frame summary;
- private pose-feature artifact reference and SHA-256;
- pose model/runtime, feature schema, scorer-contract, mirror,
  fingerprint, and integrity-policy versions;
- the Spec 013 owner-policy revision and hash accepted when the reference
  video was published;
- `revision_terms_hash`, `created_at`, and terminal timestamps.

The allowed lifecycle edges are:

```text
choreography: draft -> processing -> ready -> disabled -> retired
              draft | processing -> disabled | retired
revision:     processing -> ready | processing_failed
              ready -> disabled | retired
```

`processing_failed`, `disabled`, and `retired` revisions do not return to
`processing` or `ready`; retry creates a new revision.

A choreography is `draft` before reference processing, `processing` while no
revision has reached a terminal processing result, and `ready` once it has at
least one ready revision. `active_revision` selects the default revision for
presentation; it does not make another ready revision unselectable. The
pointer must name a ready revision of that choreography whenever the aggregate
is `ready`.

A revision is append-only. Changing the reference video, song bounds,
segment, mirror policy, feature artifact, model, schema, scorer contract, or
integrity policy creates a new revision. Once `ready`, the row and every
referenced artifact are immutable. Moving `active_revision` affects default
presentation only.

A Spec 013 owner-policy change is prospective publication policy and does not
disable an existing choreography or revision. An explicit rights or safety
disable/takedown records a cutoff and rejects new sessions. Sessions that had
not sealed their one upload by the cutoff terminate
`abandoned(reference_disabled_before_upload)`. An attempt whose upload was
sealed and whose grading dispatch was durably pending before the cutoff may
reach terminal grading and finalization under its frozen terms. A terminal
grader result durably pending finalization may also commit. Nothing after the
cutoff creates a new attempt for that revision. No committed qualification,
streak, claim, share, emission, or reward is revoked or rewritten. Retirement
uses the same no-new-session boundary without implying a rights violation.

### 4.2 Publication and alignment

The reference video must first be a published, public video Post whose
immutable intent is `song_reference` to the same published canonical
`song_post_id` and `audio_revision`. An `original_audio` Post is rejected as a
reference even if ACR identifies that song. Spec 013
checks the current derivative-video policy at reservation and publication
commit. Spec 008 applies its derivative registration and revenue-share terms.

Reference processing then:

1. verifies the immutable Post, song reference, media identity, and hashes;
2. creates or reuses the canonical segment from §3;
3. aligns the video's soundtrack to the canonical audio revision through the
   Spec 007 alignment capability;
4. proves that the requested segment maps to one continuous reference-video
   interval with acceptable confidence and drift and no time-stretch;
5. decodes only that mapped interval and produces the private, versioned pose
   reference artifact;
6. applies body-presence, coverage, visibility, principal-body,
   meaningful-motion, and integrity gates required by the reference policy;
7. persists terminal evidence and moves the revision to `ready` exactly once.

Wrong song, missing soundtrack evidence, wrong offset, excessive drift,
changed source bytes, out-of-bounds mapping, time-stretched media, insufficient
body coverage, trivial motion, or processing exhaustion fails closed. A failed
revision never becomes selectable.

The alignment relation belongs to the choreography revision, not to the
shared song segment: several videos may implement the same canonical segment
at different video offsets.

### 4.3 Featured presentation

`song_dance_presentations` is a versioned sibling presentation pointer keyed
by `(song_post_id, audio_revision)`. The song-owner account may set or clear
one `featured_choreography_id` and exact ready revision through an idempotent,
audited command. Public projections may derive `official: true` for that exact
pointer.

The pointer changes ordering, attribution, and the default routine shown by
the UI only. A change does not mutate the choreography, session, score,
qualification, or reward terms. `official`, `featured`, or "uploaded by the
song owner" never means exclusive. A funder seeking one routine must freeze a
`specific` reward scope under §9.

## 5. Dance sessions, consent, and capture

### 5.1 Session identity and frozen terms

A Dance session is authenticated, expiring, and account-scoped. Session
creation requires an explicit `persona_id` owned by the session account and
exactly one `choreography_revision_id`. The persona is active and bound to the
exact community using Spec 014's preparation path, available before joining.
Community membership and posting verification are not required to start, resume,
upload private assessment media, grade or complete an admitted attempt. The
choreography must be `ready`, not disabled or retired, and the exact revision must be `ready`. Any ready
revision is selectable; neither `active_revision` nor the featured pointer is
an exclusivity gate.

`dance_sessions` freezes:

- `session_id`, `account_id`, `persona_id`;
- `song_post_id`, `audio_revision`, `segment_id`;
- `choreography_id`, `choreography_revision`;
- `qualification_policy_version_id`, `calibration_version_id`, calibration
  checksum, captured admission state, and numeric `platform_floor_bps`;
- pose model, feature schema, scorer contract, mirror, fingerprint,
  integrity, and grader-adapter versions;
- start-cue policy, cryptographically selected cue kind, hold duration,
  observation window, and expected scored-window relation;
- `reward_mode IN (practice | reward_eligible)`;
- for `reward_eligible`, a non-empty immutable objective snapshot containing
  each exact offer/program and leg/version identity, terms hash, numeric Dance
  floor, qualification-policy and calibration versions/checksum,
  choreography scope, and disclosure version;
- `expected_scored_duration_ms` from the pinned segment;
- `created_at`, `expires_at`, state, and immutable `session_terms_hash`.

The reward snapshot records the complete set of compatible objectives the
user chose and was shown before capture. It does not reserve inventory,
promise payment, or bypass Spec 015's qualification-time availability,
entry-window, ceiling, eligibility, compliance, or solvency checks. An
objective absent from the snapshot cannot pay that session even if it appears
later. A `practice` session is explicitly rewardless: even under a
money-admitted calibration, its qualification freezes
`reward_admission = streak_only` and cannot become money-eligible later.
`reward_eligible` rejects unless the captured policy is `money_admitted` and
every snapshotted objective already contains compatible Dance terms.

One nonterminal session per `(account_id, choreography_id, revision)` is
allowed. Exact-command replay returns it. Concurrent creation with another key
resolves to one winner and a typed `session_already_active` result. A new
session is required after terminal completion or expiry.

### 5.2 State machine

```text
created
  -> consented
  -> awaiting_upload
  -> uploaded
  -> grading_pending
  -> completed | rejected | processing_failed

created | consented | awaiting_upload -> expired | abandoned
uploaded | grading_pending            -> processing_failed
```

`completed` means the grader returned a valid numeric score; it does not by
itself mean qualified or rewarded. Terminal evidence records separate
`grade_outcome: scored | rejected | failed`,
`qualification_outcome: emitted | suppressed_shadow | below_floor |
integrity_rejected | not_admitted`, and, when a qualification is emitted,
`reward_admission: streak_only | money`. Only an emitted, committed
`activity_qualification` is described as qualified. A money-admitted
qualification may still receive no reward because its frozen objectives fail
a live Spec 015 gate.

Every transition is a pure reducer decision recorded in Postgres. A Queue,
Workflow, Durable Object, browser, storage notification, or provider callback
may wake the interpreter but cannot advance product state directly.

Consent must commit before an upload reservation can accept bytes. The
receipt records the consent policy and version, bounded source, explicit
persona, timestamp, session terms hash, and retention disclosure. Consent is
not inferred from opening the camera or sending a file.

There is one logical upload per session. It uses a random private object key,
short-lived signed access, expected MIME and byte/duration bounds, and
optional browser hash as an expectation only. The server's streaming digest
over sealed bytes is authoritative. Finalize rejects a second object, an
overwrite, changed expectation, wrong session, expired reservation, or media
whose full duration cannot contain the cue lead-in plus scored interval.

The core contract is capture-channel-neutral. A separately reviewed Solid UX
may prefer an in-app camera or restrict file selection, but the server never
trusts that presentation choice as liveness. It enforces the randomized cue,
sealed-media binding, rate limits, and replay/integrity policies for every
accepted channel. No Telegram channel is admitted by this spec.

### 5.3 Start cue and scored body window

The channel-neutral start cue uses the legacy 0211 behavior as evidence:
`hands_on_head | arms_t | hands_on_hips`, cryptographically selected at
session creation, with a versioned hold requirement and observation window.
The exact allowed hold and timing range belongs to the immutable cue policy;
no adapter default is authoritative.

The attempt must show the assigned cue before the scored movement. Terminal
evidence persists integer `scored_window_start_ms`, `scored_window_end_ms`,
and `scored_duration_ms`; it verifies that the duration agrees with the pinned
segment and does not derive the boundary later from mutable code. Cue and
lead-in frames are excluded from the 6–30 second score. A wrong, missing,
late, or insufficiently held cue fails the integrity gate. The cue is replay
friction, not proof of identity, uniqueness, or a live human.

## 6. Provider-neutral reference and grader ports

### 6.1 Application boundary

The application exposes provider-neutral capabilities equivalent to:

```ts
type DanceReferenceProcessor = {
  prepareReference(input: FrozenReferenceInput): Promise<PreparedOperation>;
  observeReference(operation: PreparedOperation): Promise<ReferenceOutcome>;
};

type DanceGrader = {
  prepareAttempt(input: FrozenDanceAttemptInput): Promise<PreparedOperation>;
  observeAttempt(operation: PreparedOperation): Promise<DanceGradeOutcome>;
};
```

Names are illustrative; the responsibility boundary is normative. Prepared
input includes immutable media references and hashes, exact reference and
attempt windows, segment and choreography revision, all model/schema/scorer
versions, mirror policy, cue policy, calibration, integrity/fingerprint
policy, and an application-issued operation identity.

The provider receives no reward amount, wallet, payout destination, funder,
campaign authority, private account identity, or permission to select terms.
It returns a canonical terminal kind, optional integer `score_bps`, bounded
quality/integrity/alignment metrics, cue result, selected whole-sequence mirror
mode, bounded fingerprint material, every input/output version, and a
deterministic result digest. It returns no reward decision and no full pose or
landmark sequence to the application response.

Provider and adapter selection, including any container, hosted model, or
pose runtime, is implementation policy. Spec 021 does not name a production
vendor.

### 6.2 Behavioral grading contract

The legacy grader is the behavioral starting point, not a set of silently
ported thresholds. A calibration version must explicitly configure and test:

- duration-ratio bounds for human tempo variation;
- pose presence, usable-frame coverage, joint visibility, and missing-gap
  ceilings over the complete decoded source timeline;
- exactly one stable principal body throughout the scored interval, with
  ambiguous continuity, a subject swap, or multiple people failing closed;
- bounded global offset and monotonic constrained sequence alignment;
- local slope, warp, and unmatched-coverage penalties;
- whole-sequence mirror selection under `strict | allowed`;
- meaningful-motion energy and spatial-extent floors;
- malformed, non-finite, decode, and insufficient-evidence rejection;
- exact, transcoded, near, post-alignment, and duplicate-attempt reference
  replay checks;
- deterministic integer score derivation and result digest.

Decoded timestamps are authoritative evidence. Extraction validates monotonic
timestamps and builds a fixed scoring grid over the complete scored interval.
A frame or timestamp span omitted by the decoder or pose runtime remains
missing evidence and counts against coverage and gap ceilings. Resampling,
feature extraction, or sequence alignment must not interpolate through,
delete, or time-compress such a gap. Alignment may match usable observations
only and retains every unmatched-coverage penalty.

Visibility and confidence determine whether evidence contributes and whether
coverage passes; they never multiply an error toward zero. Reducing or
removing visibility cannot improve an otherwise identical attempt's score.
The only permitted outcomes are:

1. the score remains unchanged because the affected evidence was already
   excluded under the frozen usability rule;
2. usable coverage or confidence-weighted evidence decreases and the score
   does not increase; or
3. the attempt rejects for insufficient evidence.

Angle, position, velocity, and timing features follow the same versioned
usability rule.

Reference-copy and duplicate-attempt fingerprints are claimed atomically with
terminal evidence under a versioned policy, key version, match scope, and
bounded retention epoch. A read followed by an unconstrained insert is not a
valid uniqueness decision. An admitted policy defines bounded whole-sequence
and segment fingerprints; an empty segment set is malformed unless that
policy explicitly disables segment matching. Collision handling and any
same-account or platform-wide match scope are frozen policy, never adapter
defaults.

Constrained time alignment may tolerate a human performing slightly faster or
slower. It does not authorize altering the canonical audio, stretching the
reference video, or grading against a different song interval.

The six-second minimum never overrides these gates. A six-second still pose,
single trivial gesture, mostly absent body, clipped sequence, or insufficient
motion emits no qualification even if its duration is valid.

### 6.3 Attempt dispatch and callbacks

Every attempt has one logical `attempt_id` and bounded immutable dispatch
generations. The application prepares and hashes the complete provider
request before dispatch. Submission uncertainty remains `uncertain`, never
automatic failure or a second logical attempt. Observation, callback, and
reconciliation converge through the same interpreter.

Callbacks require a versioned authentication key, bounded timestamp skew,
exact raw-body authentication, operation and attempt binding, and complete
hash/version agreement. Identical terminal replay is a no-op. A different
terminal result for the same attempt is rejected, opens an operator item, and
does not overwrite evidence.

### 6.4 Spend and abuse bounds

Before `streak_admitted`, the qualification policy must freeze non-null
limits for active sessions per account, session creation and upload
finalization over account- and privacy-preserving network buckets, grading
submissions per account and time window, total provider spend per account and
environment, and bounded dispatch attempts. Exceeding a limit rejects before
provider dispatch and creates no extra reservation or qualification.

One sealed media digest cannot be retried under a new session, choreography,
persona, or idempotency key. An uncertain dispatch is reconciled under its
existing logical attempt; it is never charged as authority for a fresh media
submission. Network buckets are abuse controls, not identity or uniqueness
claims, and use bounded retention.

## 7. Calibration and admission

### 7.1 Immutable versions

`dance_calibration_versions` and
`dance_qualification_policy_versions` freeze:

- `calibration_version_id` and checksum;
- `qualification_policy_version_id`;
- `admission_state IN (shadow | streak_admitted | money_admitted)`;
- integer `platform_floor_bps` in `0..10_000`;
- reference and attempt pose model/runtime, feature-schema, scorer-contract,
  mirror, cue, fingerprint, and integrity versions;
- every grading threshold and coefficient needed for deterministic replay;
- dataset/evaluation report references, approval evidence, `effective_at`,
  and immutable terms hashes.

An admission change appends a new prospective policy version. It never mutates
an older version. Promotion is monotonic:

```text
shadow -> streak_admitted -> money_admitted
```

A safety suspension may prevent new sessions under a policy, but it does not
rewrite its captured admission state or retroactively change an outcome.

### 7.2 Meaning of each state

- `shadow`: permitted only for private evaluation. It persists bounded
  diagnostics and cleanup evidence but creates no `activity_qualification`,
  streak day, leaderboard fact, reward claim, pool share, or emission.
- `streak_admitted`: a passing future session creates one Dance
  `activity_qualification` and may advance song and community streaks. The
  qualification freezes `reward_admission = streak_only`; every funded
  Spec 015 consumer must reject it.
- `money_admitted`: a passing future `reward_eligible` session creates a
  qualification with `reward_admission = money`. A passing `practice` session
  still freezes `reward_admission = streak_only`. A money-marked
  qualification is only potentially eligible; each snapshotted reward term
  must independently name Dance, meet or raise the numeric platform floor,
  pin the compatible policy and calibration, pass its choreography scope, and
  satisfy all ordinary Spec 015 gates.

Promotion never upgrades an earlier session or qualification. A session
created under `shadow` stays shadow. A qualification created under
`streak_admitted` remains streak-only forever. A new floor, checksum, model,
schema, scorer, or integrity rule creates a new policy version and applies
only to sessions created under it.

No numeric Dance floor is admitted by this document. Shadow evaluation must
produce the reviewed calibration evidence; a dated control-plane admission
records the first streak floor, and a later dated admission records the first
money floor. A Karaoke or legacy provisional value is not a default.

## 8. Finalization and Dance qualification

### 8.1 Finalization reducer

The finalization transaction:

1. authenticates and binds the terminal grader evidence to the exact session,
   attempt, upload digest, segment, choreography revision, calibration,
   policy, and scorer contract;
2. checks cue, media quality, body coverage, meaningful motion, alignment,
   mirror, reference-copy, duplicate fingerprint, and integrity decisions;
3. derives the separate grade and qualification outcomes, verifies the integer
   score against the captured numeric platform floor, and derives
   `reward_admission` from captured admission plus `reward_mode`, without
   accepting a provider reward decision;
4. persists the immutable terminal attempt and bounded evidence summary;
5. emits no qualification under `shadow`;
6. only for an integrity-accepted score at or above the floor under an
   admitted state, inserts exactly one Dance `activity_qualification` through
   the Spec 015 producer boundary;
7. lets Spec 015 consume only that committed row for streaks and, when its
   frozen admission is `money`, only the compatible reward objectives frozen
   before capture;
8. schedules raw-media and ephemeral-artifact cleanup.

A Durable Object, provider callback, storage event, Queue message, Workflow,
browser command, or operator cannot insert the qualification directly.

### 8.2 Qualification evidence

The Spec 015 record retains its ordinary account, persona, community, song,
audio, score, policy, time, and uniqueness fields. For Dance:

- `attempt_ref` is the typed `(dance_session_id, dance_attempt_id)` identity;
- `reward_admission` is `streak_only | money` and is immutable;
- `evidence_summary` contains choreography id and revision, segment id and
  bounds, persisted attempt `scored_window_start_ms`,
  `scored_window_end_ms`, and `scored_duration_ms`, opaque evidence ids or
  digests for reference and attempt hashes, score, platform floor,
  calibration id/checksum, scorer/model/schema versions, mirror outcome, cue
  outcome, bounded coverage/motion/alignment metrics, fingerprint-policy
  version, and result digest;
- an evidence id or digest is non-enumerable and never an R2 key, object path,
  signed URL, provider URL, or raw-media locator. Cleanup state stays in the
  private session and cleanup aggregates, not the qualification projection;
- raw frames, audio, full landmarks, face material, signed URLs, provider
  prose, and private object keys are absent.

The one-row uniqueness rule remains account-scoped. Personas do not multiply
qualifications, streaks, claims, shares, emissions, or leaderboard entries.

## 9. Rewards and choreography scope

### 9.1 Attachment authority

Funding remains on the Spec 015 song offer leg or community program. A
choreography aggregate holds no budget, reward balance, payout destination,
claim counter, or bounty authority.

After this spec is ratified, the conforming Spec 015 amendment defines:

```ts
type DanceChoreographyScope =
  | { kind: "any_policy_accepted" }
  | {
      kind: "specific";
      choreography_id: string;
      choreography_revision: number;
    };
```

Every immutable song-offer leg whose `eligible_activities` includes `dance`
must freeze a scope. `specific` is valid only when the exact revision is
`ready` and its `song_post_id` and `audio_revision` equal the offer. The scope
does not follow the active-revision or featured pointer.

`any_policy_accepted` accepts any exact revision whose reference publication
captured an accepting Spec 013 owner-policy revision and which was ready and
selectable when its session was created for the same song and audio revision.
A later prospective policy change does not make that existing revision
ineligible. The dancer still selects one revision before recording; the grader
never tries several. Every Dance-aware objective, including a community
program emission objective, may freeze either scope; community programs are
expected to use `any_policy_accepted` normally, while `specific` deliberately
narrows that program version to qualifications for its one resolved song and
revision.

### 9.2 Dance term compatibility

A Dance-aware leg or program version freezes:

- `dance` in `eligible_activities`;
- numeric `min_score_bps` for Dance, not below the captured admitted platform
  floor;
- exact `qualification_policy_version_id`, `calibration_version_id`, and
  calibration checksum accepted for the objective;
- the choreography scope and its terms hash;
- all existing Spec 015 asset, funding, time, capacity, entry-window,
  eligibility, compliance, ceiling, and solvency terms.

A different calibration or qualification-policy version does not silently
match. New calibration support requires a new immutable leg or program
version under Spec 015's lifecycle rules. An objective cannot lower the
platform floor; it may raise its own numeric threshold.

Study/Karaoke-only terms never match Dance. Dance-only terms never match
Study or Karaoke. A `streak_only` Dance qualification never reaches a funded
consumer even if activity, score, scope, and inventory otherwise match.

The `specific` scope is the v1 answer when a funder wants one recognizable
routine or the song owner's featured dance. The featured label alone never
creates exclusivity. A rewarder wanting a new segment with no ready routine
must wait for a later choreography-challenge specification.

### 9.3 Claim timing and promises

Offer inventory, pool entry windows, ceilings, eligibility, compliance, and
solvency are evaluated by Spec 015 at qualification commit against the
session's immutable objective snapshot. The snapshot is not a reservation;
an omitted or later-created objective cannot pay. Solid must distinguish
"eligible if you qualify while available" from a guaranteed payout and must
show the exact routine when scope is `specific`.

## 10. Rights, publication, and visibility

A choreography reference video and any ordinary public Dance video admitted as
reference supply are published derivative video Posts carrying
`song_reference`. Original-audio videos may be ordinary public Posts but are
never choreography references. Spec 013's current owner policy and the
immutable license terms govern song-reference publication;
Spec 008 governs derivative registration and revenue share. A choreography
does not introduce a new license category.

A private grading attempt is consent-gated assessment media bound to one
session. It is never a public Post, never appears in a feed, and does not by
itself require a new public derivative-video permission. Publicly posting the
same or another recording is a separate Post-creation action and is not proof
of qualification. That action requires the community's posting gate and current
membership under Spec 013; the private activity does not. A missing proof cannot
block recording or grading and cannot cause automatic upload to the publication
flow. A denied publication preserves the activity outcome and follows the private
media retention policy; this amendment creates no retention extension.

An owner-provided reference dance follows the same path as any other
reference: separate video Post, typed song reference, canonical segment
extraction, alignment, reference processing, and immutable revision. The
owner may then set the featured presentation pointer. It is not embedded in
the song bundle and receives no scoring advantage.

Owner-policy changes are prospective. They may block a future video
publication but do not disable existing ready choreography, in-flight session,
qualification, or reward history. Rights or safety takedown of a particular
Post or choreography is a different audited path. Its effect on new sessions
must be explicit; no ordinary owner-policy update acts as takedown.

## 11. Privacy, retention, and integrity

### 11.1 Private media

Attempt media uses random, non-enumerable private object keys and short-lived
provider access. No public URL is created. Object keys, signed URLs, provider
payloads, raw callback bodies, raw grader prose, reward amounts, and account
or wallet identifiers are excluded from ordinary logs.

Raw attempt video and extracted attempt audio or frames are deleted as soon as
terminal evidence commits. Cleanup is a durable retryable operation with an
R2 lifecycle backstop; expired, abandoned, and processing-failed sessions use
the same path. Exact operational deletion deadlines and provider-copy
attestations must be frozen before `streak_admitted`. Raw media is unavailable
for ordinary dispute review or model training.

The published choreography reference video follows ordinary Post retention.
Its derived pose reference artifact is private, content-addressed, versioned,
and retained while required to grade selectable revisions or nonterminal
sessions and to preserve auditable version identity. It is not exposed to
Solid.

### 11.2 Evidence minimization

The durable attempt evidence contains bounded metrics and hashes, not raw
audio, raw frames, full pose/landmark streams, face crops or embeddings, or a
reusable unkeyed motion template. Replay fingerprints are versioned,
platform-keyed HMAC values with a bounded, policy-defined retention period and
key rotation. Expiring a fingerprint does not delete or alter qualification
evidence.

No Dance evidence makes a person-level, biometric, uniqueness, or liveness
claim. Very eligibility remains a separate Spec 015 scarce-leg check.

### 11.3 Account and persona boundary

Commands require explicit `persona_id`; the server verifies ownership by the
session account. Public choreography, streak, leaderboard, and featured
projections expose personas only. They never expose `account_id`, wallet, HD
index, owner account, sibling-persona linkage, private object identity, or
fingerprint. Private session, attempt, and reward responses use `no-store`.

## 12. Durable execution, storage, and wire surface

### 12.1 Reducers and recovery

Separate pure reducers own:

- choreography reference processing and readiness;
- featured-presentation updates;
- session, consent, reservation, upload, expiry, and cleanup;
- grader preparation, dispatch, observation, and finalization;
- calibration admission;
- Dance qualification production.

Postgres is the system of record. Transactional outbox events launch work
only after commit. Request and reconciler paths call the same interpreter.
Provider work runs outside database transactions. Every external call has a
stable operation identity, frozen request hash, bounded attempts, explicit
`uncertain` state, and reconciliation. Terminal evidence is append-only.

### 12.2 Storage sketch

Forward-only Postgres storage, with ordinal assigned only at dispatch:

- segment and choreography: `dance_song_segments`, `dance_choreographies`,
  `dance_choreography_revisions`, `dance_reference_processing_attempts`,
  `dance_reference_artifacts`, `song_dance_presentations`;
- policy: `dance_calibration_versions`,
  `dance_qualification_policy_versions`, `dance_policy_admission_events`;
- attempts: `dance_sessions`, `dance_session_consents`,
  `dance_upload_reservations`, `dance_attempts`, `dance_attempt_evidence`,
  `dance_replay_fingerprints`, `dance_media_cleanup_operations`,
  `dance_grading_usage_counters`;
- integration: the Spec 015 activity-registry row and Dance additions to
  `activity_qualifications` and frozen reward/program terms.

New empty tables and indexes use the ordinary transactional migration path.
No implementation may guess an ordinal before the coordinator reserves it.
No legacy D1 or community-shard table is copied.

### 12.3 Contract and projection sketch

Generated contracts define commands for:

- create a choreography from one published song-referenced video and chosen
  bounds; inspect processing; append a revision; disable or retire;
- list ready choreographies for a song/audio revision and fetch one immutable
  public revision projection;
- set or clear the featured presentation as the song owner;
- create a session with one revision and persona; record consent; reserve and
  finalize one upload; submit for grading; fetch private terminal status.

Public choreography projections include song and audio identity, segment
bounds and duration, revision, readiness, mirror policy, public reference
video, creator persona, and derived featured state. They contain no score
promise or account identity. Private session projections include the selected
revision, cue instructions, scored duration, captured policy/admission state,
upload/processing state, bounded result, cleanup state, and conditional reward
disclosure. They are `no-store`.

Contracts land in `packages/contracts` first. api-next implements only the
generated contract, and Solid consumes only the reviewed generated client.
Solid neither computes nor submits score, alignment, qualification,
admission, reward eligibility, or payout facts.

## 13. Implementation order and gates

The first five specification checkpoints were ratified in this fixed order:

1. Land the standalone Spec 015 asset-leg erratum without enabling Dance.
2. Land the Spec 013 song-owner and owner-policy amendment, plus its Spec 015
   naming/snapshot alignment, before the song-offers slice.
3. Land the Spec 013 video-track amendment and its Spec 007, 008, and 010
   conforming edits before relying on video publication authority.
4. Reconcile Spec 021 against those ratified texts, complete Appendix C's
   calibration protocol and pre-registered target-record shape, and ratify
   Spec 021 without admitting a provider or numeric floor.
5. Land the Spec 015 Dance integration amendment and amend Spec 007's transform
   port for deterministic canonical segment extraction and
   reference-soundtrack alignment; review generated contracts. Keep Dance
   reserved and every funded consumer unreachable.

The remaining implementation order is fixed:

6. Implement segment, choreography, reference processing, and featured
   presentation without an attempt or reward path.
7. Implement consent, private capture, attempts, cleanup, and the
   provider-neutral grader in `shadow`. Deterministic reference fixtures make
   this phase independent of production video reference supply.
8. Admit a reviewed calibration to `streak_admitted`; prove one
   qualification and streak with every money path unreachable.
9. After separate calibration, legal, eligibility, custody, and production
   review, admit `money_admitted` for explicit Dance terms only.
10. Specify freestyle and choreography challenges separately, if pursued.

Dance is independent of the Study item-source and Karaoke runtime chain.
Nothing here blocks or broadens the current Study/Karaoke qualification and
streak slice. Each runtime phase receives separate api-next and Solid task
records, worktrees, contract review, and acceptance. Ratification does not
authorize a provider account, network egress, deployment, public upload,
token action, custody action, or money movement.

The exact Spec 007 capability amendment is recorded. Before the first runtime
dispatch, the control plane must record the migration ordinal, task dependency,
provider test boundary, private-media lifecycle, and worktree capacity. Before
`streak_admitted`, it must record the numeric floor and calibration evidence.
Before `money_admitted`, all Spec 015 and 004 production gates still apply.

## 14. Acceptance

### 14.1 Segment and reference

- `5999 ms` and `30001 ms` scored intervals reject; `6000 ms` and
  `30000 ms` accept when every other guard passes. The accepted interval is
  the body-tracked score window; cue and lead-in are outside it.
- Negative, reversed, non-integer, beyond-song, or overflow bounds reject.
  Half-open-boundary fixtures prove exact extraction.
- Exact segment creation replay returns one row. A changed audio revision,
  source hash, extraction profile, bound, or canonical output hash cannot
  reuse the identity.
- Correct soundtrack offset passes alignment. Wrong song, wrong offset,
  missing audio, excessive drift, altered segment, and time-stretched source
  fail closed. Two videos may align the same segment at different video
  offsets without changing the segment.
- A valid six-second clip with stillness, trivial motion, inadequate body
  coverage, or insufficient usable frames fails reference readiness or
  qualification as applicable.

### 14.2 Choreography, rights, and presentation

- A ready revision cannot mutate. New media, bounds, segment, mirror policy,
  model, schema, scorer, or feature artifact creates a new revision. Moving
  the active pointer changes the default presentation only; any other ready
  revision remains selectable and a specific reward may pin it.
- The reference video is a separate published, public video Post with the
  exact `song_reference` song and audio revision. An `original_audio` video is
  rejected even when its ACR evidence identifies that song; the song bundle
  rejects a Dance attachment.
- The exact `allowed`, `owner_only`, and `blocked` matrix and license-default
  fixtures come from the dated Spec 013 amendment and govern new publication.
  Spec 021 consumes their revision/hash and defines no duplicate mapping. A
  later policy revision does not invalidate a ready revision or qualification.
- Only the song-owner account can set the featured pointer. Changing it
  changes presentation only and leaves score, floor, eligibility, and reward
  scope unchanged.
- A public freestyle or ordinary dance video creates no session or
  qualification.
- Phase 7 shadow scoring runs against deterministic fixtures without requiring
  production reference supply. Production authority resolution accepts only
  eligible song-reference videos and never counts generic video volume.
- A policy-only update does not disable a revision. An explicit rights/safety
  cutoff rejects new sessions and abandons pre-upload sessions; a sealed
  attempt durably pending before the cutoff may finalize. No committed
  qualification or reward is revoked.

### 14.3 Session and capture

- Session creation requires one active persona and one ready revision.
  Missing, multiple, cross-song, cross-audio, disabled, or retired revisions
  reject. A revision swap after creation is impossible.
- A reward-capable session rejects without a non-empty compatible objective
  snapshot captured before consent/upload. A practice session snapshots no
  objective, freezes `streak_only`, and cannot receive a later-created offer.
  The snapshot may contain compatible offer legs and a program objective
  together; none is a reservation.
- Concurrent creation for one account and revision yields one nonterminal
  session. Same-key/same-hash replay returns identical bytes;
  same-key/different-hash conflicts.
- Consent commits before the first stored byte. Wrong consent policy,
  persona, session terms hash, or expired session rejects without storage.
- One upload seals once. Overwrite, second object, wrong MIME/size/duration,
  changed server digest, expired reservation, or cross-session reuse fails
  closed.
- Start-cue fixtures cover assignment persistence, every cue kind,
  hold/window boundaries, wrong or absent cue, scored-window exclusion, and
  immutable `scored_window_start_ms`, `scored_window_end_ms`, and
  `scored_duration_ms` evidence.
- Account and privacy-preserving network quotas bound parallel sessions,
  upload finalization, grading submissions, provider spend, and dispatch
  attempts. The same sealed media digest cannot be retried under another
  session, revision, persona, or idempotency key.

### 14.4 Grading and security

- Fixtures cover honest performance, bounded offset and human tempo variation,
  mirror strict/allowed, low visibility, missing coverage, stillness, trivial
  motion, reverse/shuffle, unrelated movement, multiple people,
  malformed/non-finite input, exact/transcoded/near reference replay, and
  deterministic repeated grading.
- Decoder-hole fixtures omit timestamps rather than supplying explicit empty
  pose frames and prove that the missing spans remain gaps, reduce coverage,
  and cannot be interpolated or time-compressed away. Reducing landmark
  visibility on an otherwise identical attempt never raises its score.
- Subject-continuity fixtures cover one stable body, a second body entering,
  an ambiguous principal body, and a cross-frame identity swap. Only the one
  stable-body case may proceed to similarity scoring.
- Concurrent whole-sequence and segment-fingerprint claims converge to one
  integrity decision and one terminal attempt. Empty segment material,
  policy/key mismatches, and a read-then-insert race fail closed.
- The grader receives no account, wallet, reward, funder, or payout data and
  cannot select a choreography or return a reward decision.
- Stale callback time, wrong key version, invalid authentication, altered raw
  body, wrong operation, session, upload, segment, revision, calibration, or
  scorer version fails closed. Identical terminal replay is harmless; a
  conflicting terminal result preserves the first and opens an operator item.
- Duplicate Queue or Workflow delivery, restart before or after provider
  submission, lost response, and request/reconciler races produce no duplicate
  attempt or terminal evidence.
- A valid numeric score records `grade_outcome: scored` independently of
  `qualification_outcome`; shadow, below-floor, integrity-rejected, and
  admitted cases cannot be confused with a committed qualification or reward.

### 14.5 Calibration, qualification, and rewards

- Before producer activation, generated contracts continue to reject
  `activity: "dance"`, the registry remains `reserved` with no producer or
  current policy, and Postgres rejects a Dance qualification insert. Landing
  this specification, adding empty Dance tables, or running shadow grading
  cannot activate the registry or make a funded term valid.
- Shadow produces private evidence and cleanup only. A passing streak-admitted
  attempt produces exactly one qualification and records the Dance activity
  once while creating at most one new song and community streak-day row; an
  existing same-day row is reused under Spec 015. No asset claim, pool share,
  emission, signer, chain, or payout effect is reachable. Money admission
  applies only to future sessions.
- Promoting a calibration never changes a shadow result or a `streak_only`
  qualification. Changing floor, checksum, model, schema, scorer, or integrity
  policy creates a new immutable version.
- Dance finalization one basis point below and exactly at the admitted platform
  floor behaves deterministically. A reward floor below the platform floor is
  invalid; an equal or higher floor uses exact integer comparison.
- Dance reward terms reject a missing activity, numeric floor, calibration,
  qualification-policy version, or choreography scope. Study/Karaoke-only
  terms do not pay Dance, Dance-only terms do not pay Study/Karaoke, and
  `streak_only` never pays.
- `any_policy_accepted` and `specific` scopes behave exactly. Specific scope
  rejects another revision even when it is the default active revision or
  featured. Any scope still grades one dancer-selected revision, never
  best-of-many. Offer legs and
  community program objectives both cover the two scope variants.
- Two personas of one account cannot double-qualify for the same attempt,
  consume two bundle claims, hold two shares for one pool/drawing, double-emit,
  or earn two streak days. Public results expose persona only.
- Reward inventory, pool entry window, ceilings, eligibility, compliance, and
  solvency remain live Spec 015 checks; a frozen objective snapshot cannot
  promise or reserve them, and an objective omitted from the snapshot cannot
  pay.

### 14.6 Privacy, cleanup, and projections

- Public projections contain no account, wallet, HD index, sibling-persona,
  private object, consent, provider-payload, or fingerprint material. Private
  session and reward responses are `no-store`.
- Terminal, expired, abandoned, and failed sessions all schedule cleanup.
  Retry and lifecycle-backstop fixtures delete raw attempt video, extracted
  audio/frames, and provider copies without deleting immutable bounded
  evidence.
- No raw media, full landmark stream, face embedding, or reusable unkeyed
  motion template persists. Fingerprint expiry and key rotation leave the
  qualification ledger unchanged.
- Qualification evidence uses opaque non-enumerable evidence ids or digests,
  never object keys, paths, or provider URLs. Cleanup state remains private
  session/operation state and is absent from public or economically consumed
  qualification projections.
- Generated-contract fixtures cover every command, typed rejection, public
  projection, private projection, and unknown enum member. Solid sends no
  score or settlement truth.

## Appendix A. Dated Spec 015 conforming amendment

The Spec 015 asset-bonus erratum lands first and remains Study/Karaoke-only.
The dated 2026-08-30 reserved-Dance amendment consumes this appendix before
any Dance producer is enabled. It does all of the following:

1. add `dance` to the open activity registry without converting it to a CHECK
   enum;
2. extend `attempt_ref` and `evidence_summary` with §8.2's typed Dance shape;
3. persist `reward_admission = streak_only | money` for Dance and require
   `money` in every funded consumer;
4. require the §9 choreography scope, qualification-policy version,
   calibration version/checksum, and numeric Dance floor in every Dance-aware
   objective;
5. allow either scope for a song offer leg or community-program emission
   objective, with `any_policy_accepted` as the normal community-program
   configuration and `specific` as an explicit one-song/revision narrowing;
6. require a reward-capable session to freeze every compatible objective
   before capture and prohibit omitted or later-created objectives from paying
   that session;
7. preserve every existing account uniqueness, persona projection,
   eligibility, compliance, clock, inventory, custody, and money invariant;
8. keep `dance` unavailable in funded terms until a dated
   `money_admitted` policy exists.

The registry admission, producer enablement, streak admission, and money
admission are distinct control-plane events. Ratifying the name `dance` is not
money admission.

## Appendix B. Dated Spec 007 capability amendment

The dated 2026-08-30 Spec 007 amendment owns these provider-neutral,
deterministic capabilities before reference runtime:

```ts
extractCanonicalAudioSegment({
  canonical_audio_ref,
  canonical_audio_sha256,
  start_ms,
  end_ms,
  extraction_policy_version
}) -> {
  segment_audio_ref,
  segment_audio_sha256,
  duration_ms,
  media_facts,
  transform_revision
}

alignVideoSoundtrackToSong({
  video_ref,
  video_sha256,
  song_audio_ref,
  song_audio_sha256,
  requested_start_ms,
  requested_end_ms,
  alignment_policy_version
}) -> {
  reference_video_scored_start_ms,
  reference_video_scored_end_ms,
  detected_song_offset_ms,
  drift_metrics,
  confidence_metrics,
  evidence_ref,
  result_digest,
  alignment_revision
}
```

These are not the existing server-internal 10–15 second ACR sample and do not
reuse its semantics. The transform implementation remains provider-neutral,
hash-bound, retry-safe, and unable to publish, qualify, or reward by itself.

## Appendix C. Calibration protocol and open implementation inputs

### C.1 Calibration and scorer-conformance protocol

Before any shadow corpus is graded, a dated evaluation plan freezes its
dataset version and checksum, label rubric, consent and retention terms,
participant and recording-session pseudonyms, choreography revisions, device
and capture-condition strata, scorer/model/schema versions, and deterministic
split seed. Raw media and derived landmarks remain private under section 11.

The corpus has separately labeled lanes for:

- honest performances spanning intended skill variation, bounded offset,
  tempo, mirror, device, framing, and capture conditions;
- honest but insufficient-evidence recordings, including low coverage,
  timestamp holes, poor visibility, clipped bodies, multiple or unstable
  subjects, stillness, and trivial motion;
- non-matching movement and wrong choreography;
- first-segment truncation, reverse, shuffle, exact/transcoded/near reference
  replay, tempo replay, duplicate attempts, and other integrity attacks named
  by the frozen policy.

Participant assignment is subject-disjoint: no participant or recording
session may appear in more than one of development, calibration, and held-out
evaluation. Deduplication happens before splitting. The held-out labels and
outcomes remain unavailable while coefficients, gates, and a candidate floor
are selected. A changed model, feature schema, scorer, gate, coefficient,
fingerprint policy, cue policy, or floor requires a new version and a fresh
held-out evaluation; it cannot reuse a report as if nothing changed.

Each evaluation report records counts and score/rejection distributions by
lane and required stratum; false-accept and false-reject estimates at the
candidate floor; quality-gate rejection rates; replay/integrity detection
rates; deterministic-repeat agreement; confidence intervals and their method;
all exclusions; and the immutable inputs and result checksum. Aggregate
metrics may not hide a required stratum that misses its target.

### C.2 Pre-registered numeric target record

Before the held-out set is opened, a dated target record freezes integer or
rational bounds for participant and recording counts, every required stratum,
maximum false-accept and false-reject rates, minimum integrity-detection and
determinism rates, confidence level and interval method, quality-rejection
bounds, and the rule for selecting `platform_floor_bps`. The record states
separate evidence requirements for `streak_admitted` and `money_admitted`.
This spec supplies no default number. A target chosen after observing held-out
results invalidates that evaluation for admission.

Admission requires a report satisfying every pre-registered target, an
independent review of exclusions and privacy evidence, exact version/checksum
binding, and a dated control-plane decision. Failure remains `shadow`; it does
not trigger threshold tuning against the same held-out set. Money admission
requires its separately frozen target record and evidence and cannot inherit a
streak admission report by implication.

### C.3 Remaining implementation inputs

Ratification intentionally does not choose:

1. a Dance grader or pose-model provider;
2. numeric streak or money floors and their calibration datasets;
3. calibration coefficients, tempo/warp tolerances, cue hold/window ranges,
   media byte caps, or frame-rate profiles;
4. active-session, account/network rate, grading quota, provider-spend, and
   dispatch-attempt limits;
5. raw-media cleanup deadlines, provider deletion attestations, fingerprint
   retention, and key-rotation periods, all of which must be bounded before
   streak admission;
6. an appeal or dispute product that would require different retained
   evidence;
7. choreography challenges or freestyle policy families.

Each input requires a dated review before the stage that consumes it. None may
be silently supplied by an adapter default.


## Participation boundary acceptance — 2026-09-06

An authenticated account with no community membership or posting proofs can
prepare its exact-community persona and start, replay, resume and complete this
activity on eligible content. Completion preserves ordinary private results and
account-scoped deduplication without creating membership, follow or Post rows.
Resource/age restrictions, wrong-community or inactive personas and provider
readiness still reject truthfully. A reward-only refusal leaves completion intact.
No activity completion requests Palm or another community posting proof. Dance
publication, where offered, is a separate gated action; Study and Karaoke offer
no Post action. These are required API/composed and Solid/browser fixtures, not
a claim that the currently deployed implementation already passes them.
