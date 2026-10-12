# Activity rewards: community tokens, song bonus offers, and Megapot pools

## Guest participation successor, October 11, 2026

Spec027 owns prospective v3 guest/account owner snapshots, pre-cutoff admission and immutable owner credits. Signup recovers original participation or held outcomes without a late share. Existing v2 drawings, claim-time Very subject guards, operator exceptions, financial pause controls and other reward classes remain governed by their accepted terms. All unattached/conflicted positive guest allocations remain owed and visible indefinitely; zero allocations are evidence without zero credits or sends.

See [Spec027](027-guest-study-original-drawing-participation.md). This is the
governed integration candidate; independent integration review and the frozen
API interface checkpoint remain required before delegated implementation.

> Claim-time verification amendment — ratified 2026-09-25 (§5.2a): Megapot
> pool shares need no human verification at entry. Participant winnings are
> custody-held credits that never expire; Very verification is required when
> the person claims one, with a per-pool-per-drawing subject guard. §8.2 legal
> eligibility still applies at pool entry. Asset bonuses and emissions keep §8.1.
> The notes marked "superseded for Megapot pool participants" below point here.

> Participation/posting correction — ratified 2026-09-06: Spec 006 §3A separates
> Study, Karaoke and Dance participation from community posting eligibility.
> Community verification and active membership are not activity prerequisites.
> Exact-community persona ownership remains required, with an explicit ungated
> preparation path under Spec 014 §11.2. This supersedes the membership-required
> part of the 2026-09-03 activity/persona amendment, not its privacy boundary.

> Community-persona binding amendment — 2026-09-03: Spec 014's community
> binding is now mandatory for every performing and presenting persona. Reward,
> streak, share, emission, and leaderboard-row identity remains the private
> account; this amendment does not key benefits by persona. The one public
> activity presentation in a community must be an active persona bound there,
> and community leaderboards may select handles only from that community.
> Karaoke best-score rows use the same current activity presentation instead
> of exposing the persona attached to the winning attempt. This supersedes any
> fallback to the global first persona or any presentation choice from the
> account's unrestricted persona pool.

> Account-erasure amendment — 2026-09-02: Spec 023 retains settled reward and
> qualification evidence in minimized, explicitly linkable form. Any pending
> payout, open song claim, unsettled Megapot leaf, or nonterminal chain effect
> blocks Privy deletion. Asset movement is a user action through the owning
> flow; the erasure Workflow never sweeps, signs, broadcasts, or waits on it.

> **Karaoke and Study producer amendment — 2026-08-29:** Spec 019 owns
> `karaoke_qualification_v2@1`, playback-kind evidence, the reduced competition-
> rank window key, and the finalized Study and Karaoke producer contracts. This
> spec remains authority for qualification records, Study first-pass arithmetic,
> song and community streaks, reward eligibility, emissions, and all money
> effects. Artist streaks remain deferred.

> **Song Study content amendment — 2026-08-28:** Spec 018 now owns Study
> exercise identity, generation, prompt, submission, grader, feedback,
> disclosure, session-content, and review semantics. This spec continues to own
> immutable qualification evidence, the exact first-pass score, the 70 percent
> threshold, streaks, and rewards. Existing v1 Study session shapes remain an
> interim staging implementation and must evolve through the versioned contract
> and migration gates in spec 018; no answer key or client score crosses the
> boundary during that transition.

Status: ratified specification checkpoint — 2026-08-25. Owner: workspace
human through the coordinator. This spec defines the activity-rewards product
over the account/persona boundary of spec 014 and the money invariants and
Megapot pool machines of spec 004. It supersedes spec 004's qualification
scope, settlement-asset definition, pool placement, and milestone order where
they conflict, and preserves every 004 money invariant, journal state,
recovery rule, signer boundary, pool-safety rule, and test rule. It
authorizes specification, local contract, storage, reducer, and test work
only. No deployment, provider enablement, token launch, mainnet purchase, or
migration of live data is authorized by this checkpoint.

> **Why now — 2026-08-25:** Spec 004 froze a karaoke-only, USDC-first
> product on 2026-08-18 that no longer matches the intended product: every
> qualifying Study, Karaoke, or (later) Dance activity earns a community token
> at a fixed rate; a song may carry a bonus offer whose legs are claimed by
> the account's first qualifying activity — a share of that drawing's pooled
> Megapot ticket, plus whitelisted assets such as USDC; every qualification
> advances song-level and community-level daily streaks with public
> per-persona leaderboards. api-next Postgres holds no activity runtime
> today, spec 014 admits no Base network, and no M4/M5 task record exists, so
> the product must be specified before any rewards lane opens.

> **Single-funder fallback amendment — 2026-08-25:** A user-funded
> `megapot_pool` leg may now choose `empty_pool_policy = funder_fallback`.
> The account that first funds and activates that leg is its one immutable
> sponsor. Pirate remains the on-chain ticket buyer and NFT custodian. When
> one or more accounts qualify for a drawing, only those accounts share its
> net winnings equally; the sponsor has no fallback share. When nobody
> qualifies, the sponsor is the sole frozen beneficiary and receives the net
> winnings through the ordinary reward-ledger payout machine. A fallback leg
> accepts later funding only from that same sponsor; multi-funder pool legs
> remain `no_purchase`. This amendment supersedes the platform-only fallback
> restrictions below wherever an older sentence remains ambiguous.

> **Evidence-based staging soak amendment — 2026-08-31:** The production gate
> consumes spec 004 section 15's minimum 24-hour per-affected-flow window and
> evidence closeout instead of a passive two-week wait. Every other production
> prerequisite in section 13 remains independently mandatory.

> **Asset-bonus activity-terms erratum — 2026-08-25:** Every funded
> `asset_bonus` leg freezes a non-empty `eligible_activities` set and a
> complete per-activity numeric `min_score_bps` map. A qualification can
> consume the account's one bundle claim only when at least one currently
> available asset leg matches both its activity and score. An activity or
> score mismatch is not a claim and creates no deferred entitlement. This
> erratum applies to the currently admitted Study and Karaoke activities and
> does not admit Dance.

> **Reserved-Dance integration amendment — 2026-08-30:** Spec 021 owns Dance
> choreography, grading, calibration, admission, and producer semantics. This
> spec admits the `dance` registry key in state `reserved` and defines the
> typed qualification and immutable objective bridge required by a later
> producer. It does not enable that producer, create a current Dance policy,
> accept a Dance qualification, or permit `dance` in funded terms. Shadow
> sessions remain private diagnostics. A future `streak_admitted`
> qualification is permanently `streak_only`; funded consumers require a
> prospectively captured `money_admitted` policy and `reward_admission =
> money`. No Karaoke or legacy floor becomes a Dance default.

## 0. Scope, precedence, and non-goals

This spec owns:

- the immutable activity qualification record and its enabled Study/Karaoke
  producers, plus the reserved Dance registry and integration contract;
- reward identity, uniqueness keys, and the three clock policies;
- song reward offers, legs, bundle claims, and pool shares;
- the Megapot pool leg: beneficiary snapshot, commitment, custody purchase,
  drawing observation, claim, allocation, credit, payout;
- the community token program: capability, enablement ceremony, launcher
  port, reserve vault, fixed-rate emissions, ceilings, retirement;
- song and community streaks, leaderboards, and the presenting persona;
- eligibility and compliance hooks for scarce legs;
- storage, ownership, order, and acceptance for the above.

Precedence: where this spec and spec 004 disagree on qualification scope,
settlement asset, pool placement, or milestone order, this spec controls.
Where they disagree on money invariants, journal states, recovery, signer
boundary, pool safety (004 §10.1–10.6), or test rules, spec 004 controls and
this spec is wrong. Spec 014 controls every account/persona/wallet boundary
question. Spec 006 controls what verification may claim. Spec 013 controls
post identity. Spec 012 controls community status, capability grant
discipline, and ceremony shape.

Non-goals for this checkpoint:

- Lit Protocol as signer or custodian (004 §11 v2 boundary stands).
- Community-controlled reserve custody, DAO or multisig treasuries, and any
  transfer of the reserve out of the platform vault.
- Direct-to-wallet ticket gifting, user-owned ticket NFTs, or
  user-initiated Megapot claims (rejected 2026-08-25; the pool is the
  product).
- Streak-weighted or score-weighted winnings allocation (`equal_v1` only;
  weighting is a later amendment as 004 §10.5 anticipates).
- Multi-funder fallback allocation. A `funder_fallback` leg has exactly one
  immutable sponsor; pool legs funded by more than one account use
  `no_purchase` and buy nothing when nobody qualifies.
- Random selection of one qualifier. Every account in the frozen beneficiary
  set shares equally under `equal_v1`; no second entropy or VRF ceremony
  chooses one participant.
- Automatic on-chain reinvestment of platform-sponsor winnings (v1 reinvests
  by ledger credit inside custody, §4.7).
- Free or zero-price Megapot entries (the provider has none).
- Priced, oracle-valued, or USD-par accounting for community tokens.
- Arbitrary browser-supplied token addresses as reward assets.
- Person-level uniqueness or Sybil-resistance claims (006).
- Import of historical reward, campaign, pool, streak, or Megapot state.
- Deriving a token symbol from a community route root.
- Dance runtime (envelope reserved; producer by amendment).

## 1. Decision summary

1. One immutable `activity_qualification` per qualifying attempt is the
   only input to rewards and streaks. Producers are server-side pure
   reducers; browser scores are never settlement truth.
2. Reward identity is the account. Public presentation is one selected active
   persona bound to the exact community. Personas never multiply rewards,
   shares, or leaderboard entries, and one persona never presents in two
   communities.
3. A community token program emits a fixed atomic-unit amount per
   qualification, once per `(account, program, post, activity, UTC day)`,
   under mandatory per-account and per-program daily ceilings and a
   fail-closed reserve solvency gate. Emissions are ledger credits settled
   through the 004 credit → payout machine.
4. A song has at most one nonterminal reward offer. An offer holds
   independently funded legs: `megapot_pool` and `asset_bonus`. Asset legs
   are claimed once per `(account, offer)` by the account's first
   qualification whose activity and score satisfy at least one leg's frozen
   `eligible_activities` and `min_score_bps` terms, receiving only matching
   legs available at that instant; no deferred entitlement and no
   retroactive legs.
5. A Megapot pool leg buys `tickets_per_drawing` (v1: 1) tickets per
   drawing into platform custody while budget lasts. A `no_purchase` leg
   buys only when at least one beneficiary exists. A single-sponsor leg may
   instead buy every drawing (`empty_pool_policy = funder_fallback`): with
   qualifiers, only they share; with none, the sponsor is the sole frozen
   beneficiary. Platform-sponsor winnings are credited to the shared
   sponsorship budget in custody, immediately reusable for more tickets and
   withdrawable on request. An external sponsor's winnings become an
   ordinary USDC reward-ledger credit payable to its frozen persona. An
   account's first qualification inside a drawing's entry window earns
   exactly one beneficiary share for that drawing. The
   beneficiary set is frozen and committed before purchase. Shares reset per
   drawing (key `(account_id, pool_leg_id, drawing_id)`); one account may
   hold shares in several song pools for the same drawing. Net winnings
   actually received are divided equally among the frozen beneficiaries
   with deterministic remainder allocation, credited as USDC liabilities,
   and paid through the ordinary payout machine. Fewer qualifiers means a
   larger share; that mechanic is intentional.
6. Streaks use an account-pinned IANA timezone; a song day and a community
   day are each earned once per account per local day by any qualification.
7. Monetary activity rewards require independent human verification, even for
   nonmembers: pool shares, asset bonuses and community-token emissions. The
   reward evaluator requires human.personhood plus credential.subject_unique;
   failure blocks only the monetary effect, never scoring, qualification,
   progress or admitted nonmonetary standings. Membership is not a substitute.
   Superseded for Megapot pool participants by §5.2a (2026-09-25): pool shares
   need no verification; the requirement moves to the participant claim.
8. Base 8453 is admitted as a production EVM network (014 amendment); Base
   Sepolia 84532 is test/staging only.
9. Order: qualification runtime and streaks (no money) → song offers: the
   custody ticket purchase is the first server-signed effect and ordinary
   USDC payout the second (satisfying the 004 §8 extraction trigger with
   community purchase), then winnings claim/allocation → community token
   program → dance, Lit v2.

## 2. Activity qualification

### 2.1 Record

`activity_qualifications` is immutable and account-scoped:

- `qualification_id` (server-derived, deterministic from the attempt
  identity so re-finalization dedupes on the primary key);
- `account_id` (reward identity, private);
- `persona_id` (the active owned persona that performed, bound to the exact
  `community_id`; retained as public evidence under the projection rules);
- `community_id`, `post_id`, `audio_revision` (013 §2);
- `activity` from an open Postgres registry, never a CHECK enum. `study` and
  `karaoke` have enabled producers. `dance` is present only as a `reserved`
  row with no current producer or policy;
- `attempt_ref` (typed: Study session id, Karaoke session and attempt id, or
  for a future admitted Dance result the exact
  `(dance_session_id, dance_attempt_id)` identity);
- `score_bps`, `qualification_policy_version_id`; Karaoke stores its final
  score. Study stores
  `floor(10_000 × first_pass_correct / qualifying_exercise_count)`; a Study
  qualification therefore always has a nonzero denominator, and its exact
  counts remain in `evidence_summary` so policy evaluation never depends on
  reconstructing rounded data;
- `qualified_at` (UTC instant), `reward_period_key` (UTC date),
  `streak_day` (account-pinned-timezone date, 7.1);
- `reward_admission`, required only for Dance as `streak_only | money` and
  immutable. Existing Study and Karaoke records neither infer nor synthesize
  this discriminator;
- `evidence_summary` (typed JSON; Study: exercise count, first-pass correct,
  required correct; Karaoke: scored lines, coverage bps, final score bps,
  scoring version, provider, revision; Dance: the bounded §2.4 evidence
  shape).

Uniqueness: one row per `(account_id, post_id, activity, attempt_ref)`. A
second qualification of the same activity on the same song on the same day
is a valid row; rewards and streaks dedupe on their own keys (§3).

Neither a Durable Object nor a provider callback may mint a qualification
(004 §4.2). Only the activity's pure reducer, run by the single
interpreter, produces the row, in the same transaction as the attempt's
terminal state.

### 2.2 Qualification policies (versioned, immutable rows)

- Karaoke (`karaoke_qualification_v1`): attempt `completed`;
  `scored_line_count >= 5`; coverage `>= 8500` bps; `final_score_bps >= 7000`.
  The platform floor is 7000; a program or leg may raise its own floor,
  never lower it.
- Study (`study_session_first_pass_v2`): session `completed`, every
  qualifying exercise presented, `first_pass_correct >= max(1, ceil(0.70 ×
  qualifying_exercise_count))`. Correctness is required; the historical
  "correctness not required for base reward" text is not ported.
- Thresholds, floors, minimum lines, and coverage are policy-row values.
  Changing one creates a new policy version; existing qualifications keep
  theirs.

### 2.3 Producers

- Karaoke: the 004 §4.2/§9.1 envelope → untrusted media ingest → provider
  callback bound to the envelope → pure reducer finalization with immutable
  score and provenance → qualification row. Ported clean-break into api-next
  Postgres (there is no karaoke table in api-next today).
- Study: a server-issued session with server-selected exercise items;
  answers are submitted per item and graded server-side by a pure grader
  over the stored answer key; the session reducer finalizes
  `first_pass_correct`. Solid submits answers and renders state; it never
  submits a score. Study content generation stays outside this slice and is now
  governed by spec 018. The interim typed source contract satisfied the first
  qualification implementation; production Study must adopt spec 018's
  canonical line, exercise, language, learner-band, grader, feedback, and
  provenance dimensions through a versioned successor. This slice retains the
  immutable session-item snapshot and completion reducer but may not invent a
  second content contract or depend on opaque `study_capability`.
- Dance: registry key and integration types are reserved by §2.4. Spec 021
  owns the future producer. This amendment enables no producer, policy, or
  qualification insert.

### 2.4 Reserved Dance qualification and objective bridge

A future Dance qualification can exist only through the Spec 021 finalization
reducer under a prospectively admitted policy. Its `evidence_summary` contains:

- choreography id and immutable revision, segment id and half-open bounds;
- persisted attempt `scored_window_start_ms`, `scored_window_end_ms`, and
  `scored_duration_ms`;
- opaque non-enumerable evidence ids or digests for reference and attempt
  hashes, never object keys, paths, signed URLs, provider URLs, or raw-media
  locators;
- integer score and captured numeric `platform_floor_bps`;
- `qualification_policy_version_id`, `calibration_version_id`, and calibration
  checksum;
- scorer, model, feature-schema, mirror, cue, and fingerprint-policy versions;
- bounded coverage, motion, alignment, integrity, and result-digest facts.

Raw frames, audio, full landmarks, face material, provider prose, private
object keys, and cleanup state are absent. The existing account-scoped
qualification and consumer uniqueness rules remain unchanged; personas never
multiply an effect.

Every Dance-aware funded objective freezes this complete shape:

```ts
type DanceChoreographyScope =
  | { kind: "any_policy_accepted" }
  | {
      kind: "specific";
      choreography_id: string;
      choreography_revision: number;
    };

type DanceObjectiveTermsV1 = {
  min_score_bps: number;
  platform_floor_bps: number;
  qualification_policy_version_id: string;
  calibration_version_id: string;
  calibration_checksum: string;
  choreography_scope: DanceChoreographyScope;
};
```

`min_score_bps` is an integer in `0..10_000` and cannot be below the captured
numeric `platform_floor_bps`. Neither value inherits Karaoke's 7000 or a legacy
provisional Dance value. A changed policy, calibration, checksum, floor, or
scope requires a new immutable objective version.

`specific` resolves to one ready choreography revision whose song and audio
revision equal the objective's song. It never follows the active or featured
pointer. `any_policy_accepted` accepts an exact ready revision that was
selectable when the session was created for the same song and audio revision
and whose reference publication captured an accepting Spec 013 owner-policy
revision. Community programs normally use `any_policy_accepted`; either a song
offer leg or community-program emission objective may deliberately use
`specific`.

Before capture, a Spec 021 `reward_eligible` session freezes every then-
compatible objective id, version, and terms hash. The snapshot reserves no
inventory and promises no payout. An omitted or later-created objective cannot
consume that session's qualification. A `practice` session never freezes a
funded objective.

Dance compatibility requires all of the following at qualification commit:

1. the registry producer and captured policy are enabled by separate dated
   control-plane events;
2. the qualification has `reward_admission = money` from a captured
   `money_admitted` policy and a `reward_eligible` session;
3. the objective names `dance`, meets or raises the captured platform floor,
   and exactly matches the policy, calibration, checksum, and choreography
   scope frozen before capture;
4. every ordinary activity, score, clock, inventory, entry-window, eligibility,
   compliance, ceiling, custody, and solvency guard passes.

The row remains `reserved` at this checkpoint, so condition 1 is unreachable
and no Dance qualification can be inserted. A later `streak_admitted`
qualification is permanently `streak_only`; it may advance streaks but fails
condition 2 in every funded consumer. Admission never upgrades an earlier
session, qualification, objective snapshot, claim, share, or emission.

## 3. Reward identity, uniqueness, and clocks

### 3.1 Identity

Every reward key uses `account_id`. Personas appear only as the performing
persona on the qualification and the presenting persona on public surfaces;
both must carry the exact community binding from spec 014. Two personas of one
account cannot double-claim a bundle, hold two shares in one drawing,
double-earn an emission, or hold two leaderboard rows (014 §9 extended).

### 3.2 Uniqueness keys

| Effect | Key | Extra guard |
|---|---|---|
| Community token emission | `(account_id, program_id, post_id, activity, reward_period_key)` | independent verified-subject admission (§8.1), per-account daily ceiling, per-program daily ceiling, reserve solvency gate (§6.5) |
| Asset-leg bundle claim | `(account_id, offer_id)` | `max_claims` per leg, activity/score terms, leg availability at reservation, eligibility policy (§8) |
| Megapot beneficiary share | `(account_id, pool_leg_id, drawing_id)` | entry window open, eligibility policy (§8) |
| Song streak day | `(account_id, post_id, streak_day)` | — |
| Community streak day | `(account_id, community_id, streak_day)` | — |

Worked example: A, B and C have valid independent reward verification. Song S
has a program (10 tokens per activity), a pool leg (1 ticket per drawing), and
a USDC leg. Account A sings S and scores 8200
before today's cutoff → 10 tokens; one beneficiary share in today's
drawing; USDC bundle claim; song day and community day. A studies S later
today → 10 tokens; share already held for today; bundle already claimed;
days already earned. Accounts B and C each sing S today → each gets 10
tokens, a share, and a USDC claim. The pool buys one ticket for today's
drawing with three frozen beneficiaries. If the ticket wins 900 USDC net,
A, B, and C are each credited 300 USDC. A sings S again tomorrow → 10
tokens; a new share in tomorrow's drawing; no USDC (bundle consumed); new
song and community days.

### 3.3 Clocks

- Megapot entry and drawings: the provider's `drawingId`, `drawingTime`,
  and settlement events, read on chain; never a server calendar. The pool's
  entry window for drawing `d` closes at `drawingTime(d) − entry_cutoff`.
- Emission ceilings and `reward_period_key`: UTC date of `qualified_at`.
- Streaks: the account's pinned IANA timezone (§7.1).

Stating "today" in any surface names which clock it means.

## 4. Song reward offers

### 4.1 Aggregate

`song_reward_offers` is a sibling aggregate on `post_id` (013 §7:
enrichments never move the creation operation). Fields: `offer_id`,
`post_id`, `audio_revision`, `community_id`, `created_by_account_id`,
`status IN (draft | active | paused | exhausted | expired | ended |
operational_hold)`, `starts_at`, `ends_at`, `owner_policy_snapshot`,
`terms_hash`. Exactly one nonterminal offer per `post_id`; ended, expired,
and exhausted offers remain immutable history, so a song may carry many
offers over its life.

`owner_policy_snapshot` is
`{ post_id, audio_revision, policy_revision, policy_hash }`, captured from the
Spec 013 owner-policy head when the offer is created.

An offer has at most one `megapot_pool` leg whose `participation_ends_at IS
NULL`, enforced by a partial unique index on `offer_id`. A later pool leg may
replace an ended leg but may not overlap it. Creating a parallel leg is never
a way to bypass the single-sponsor or multi-funder constraints.

Authority: any active member of the community may open an offer or add a
leg unless the song owner's policy blocks third-party legs
(`third_party_reward_legs: allowed | owner_only`). Offer-open and leg-add
intents check the current policy, and their commits recheck the same expected
revision. The song owner may always add legs. Platform-operator override is a
distinct audited path.

### 4.2 Legs

`song_reward_offer_legs` rows are immutable once funded: `leg_id`,
`offer_id`, `kind IN (megapot_pool | asset_bonus)`, `funder_account_id`
(the original sponsor account),
funding effect reference (004 §9.4 shape), `refund_policy`,
`leg_terms_hash`, `owner_policy_revision`, `owner_policy_hash`, and
kind-specific frozen terms. Each later leg-add commit freezes the then-current
Spec 013 policy revision and hash that authorized it:

- `asset_bonus`: `asset (chain_id, token_address, decimals, symbol)` from
  `reward_asset_whitelist` (§4.6), `amount_per_claim_atomic`, `max_claims`,
  `eligible_activities`, `min_score_bps` per eligible activity,
  `funded_atomic`, `reserved_atomic`, `fulfilled_atomic`, `refunded_atomic`
  with CHECK `reserved + fulfilled + refunded <= funded`.
- `megapot_pool`: the 004 §10.1 pool terms scoped to this song —
  `tickets_per_drawing` (v1 fixed at 1), `max_ticket_price_atomic`
  (ceiling), `entry_cutoff_seconds`, `beneficiary_algorithm_version =
  'equal_v1'`, frozen deployment identity `(chain_id, jackpot_address,
  usdc_address, custody_address, referrer_address, source_tag)`,
  `participation_starts_drawing_id`, `eligible_activities`, `min_score_bps`,
  `empty_pool_policy IN (no_purchase | funder_fallback)`, `funding_source IN
  (leg_budget | shared_sponsor_budget)`, `fallback_beneficiary_account_id`
  (non-null iff `funder_fallback`), and `fallback_payout_persona_id` (required
  only for a `leg_budget` fallback; it belongs to the fallback account and is
  frozen when the leg activates). For `leg_budget` legs the budget counters
  are in USDC atomic with the same CHECK. A `shared_sponsor_budget` fallback
  names the dedicated platform sponsor account. A `leg_budget` fallback names
  `funder_account_id`; only that account may fund or top up the leg, and a
  different account is rejected with `fallback_sponsor_mismatch`. A
  multi-funder leg is `no_purchase` by constraint.

`eligible_activities` is a non-empty set of activity-registry keys admitted
when the leg terms are frozen at funding. `min_score_bps` is a complete map with
exactly one integer threshold in `0..10_000` for every member of that set and
no other keys. A qualification satisfies these terms only when its activity
is a member of the set and
`qualification.score_bps >= min_score_bps[qualification.activity]`.

Both fields are included in `leg_terms_hash` and become immutable when the
leg is funded. A top-up cannot change them. At this checkpoint the broadest
configuration is `eligible_activities = {study, karaoke}` with
`min_score_bps = {study: 7000, karaoke: 7000}`. It admits every qualification
already accepted by §2.2. A funder may narrow the set or raise a threshold;
the leg threshold cannot make a non-qualifying activity record eligible.
Omission never means all current or future activities, and a reserved activity
cannot appear in funded terms.

Every asset or pool leg whose `eligible_activities` includes `dance` also
freezes one complete `DanceObjectiveTermsV1` from §2.4 in `leg_terms_hash`.
Funding rejects while the Dance registry row is `reserved`, while no dated
`money_admitted` policy exists, or when any policy, calibration, checksum,
floor, song/audio, or choreography-scope guard is invalid. A top-up cannot
change these terms. Study/Karaoke-only legs never match Dance, and Dance-only
legs never match Study or Karaoke.

An external `funder_fallback` leg has additional immutable activation guards:

- `min_score_bps` is exactly the platform qualification floor, 7000. The
  sponsor may neither raise it to suppress participation nor lower it below
  the platform floor.
- `eligible_activities` is nonempty and every named activity is currently
  available for the exact `(post_id, audio_revision)` under its server-owned
  producer contract. Karaoke requires a ready playable/scoring revision;
  Study requires the typed nonempty study-item snapshot from §2.3. Dance is
  unavailable until its producer amendment lands. A browser- or
  sponsor-supplied availability flag is never accepted.
- The song is published and present in the ordinary public discovery
  projection. An unlisted, private, removed, or otherwise undiscoverable song
  cannot activate or continue an external fallback.

The availability and public-discovery guards are live preconditions, not
frozen assertions: §5.2 re-evaluates them on every zero-share cutoff. Mandatory
non-null deployment configuration also caps each external sponsor across all
of its fallback legs by UTC day:
`external_sponsor_daily_fallback_ticket_ceiling` and
`external_sponsor_daily_fallback_spend_ceiling_atomic`.

Multiple funders may top up a `no_purchase` leg's budget through additional
funding effects. A `funder_fallback` leg accepts top-ups only from its frozen
sponsor. Top-ups add budget, never time or terms. Adding a leg never
changes another leg. An asset leg added after an account has claimed is
unavailable to that account. Adding a pool leg requires a fresh drawing
observation and freezes `participation_starts_drawing_id` to the drawing after
the observed current drawing; it cannot earn a share in the drawing already in
progress, and the offer-level partial unique index rejects an overlapping pool
leg.

Funding is inbound buyer-authorized (004 amendment 2026-08-18, 000 §11):
the funder signs; api-next observes and confirms through the chain-reader
adapter. `refund_policy` has exactly one v1 value,
`refund_to_funders_pro_rata`: when the offer reaches a terminal state,
unspent leg inventory (unclaimed asset-bonus budget; `no_purchase` pool budget
preserved on zero-share drawings, or pool budget left after the last drawing) is
refunded to each confirmed funder pro rata by contribution through
server-signed refund effects under 004 §5–§7. The platform receives unspent
budget only when the platform was the funder. The legacy "confirmed
contributions are non-refundable" rule is not ported. Unspent budget is
never platform revenue and never a ticket purchase.

### 4.3 Asset-leg bundle claim

At qualification commit, a Dance qualification enters this flow only after
every §2.4 compatibility guard passes for an objective frozen by its session.
`streak_only` or an
omitted objective creates no asset claim and consumes no bundle key.

For any admitted qualification, in the same transaction:

1. Load the song's nonterminal offer and filter its asset legs to those whose
   frozen `eligible_activities` includes the qualification's activity, whose
   frozen `min_score_bps` threshold is met, and whose inventory is currently
   available. If no such asset leg exists, create no claim row and stop.
   Emissions, pool shares, and streaks proceed regardless.
2. Evaluate eligibility (§8). Ineligible legs are recorded with a terminal
   reason and excluded.
3. Insert `song_reward_bundle_claims (account_id, offer_id)` with
   `qualification_id`, the consumed `leg_id`s, and per-leg reservations;
   decrement each leg's availability. Conflict on the primary key means the
   account already claimed: no legs, projection state `already_claimed`.
4. The claim is consumed even if only one leg was available. There is no
   deferred entitlement.

After §8 evaluation, steps 2–4 retain the claim when at least one
term-matching, inventory-available leg existed before §8. Legs blocked by §8
retain their terminal reasons and receive no reservation or credit. If no
term-matching, inventory-available leg existed before §8, no claim row is
created.

Availability of an asset leg: `max_claims` remaining and funded inventory
covers `amount_per_claim_atomic`. Asset credits go to the account's reward
ledger immediately (004 §9.3 credit key generalized to `(account_id,
leg_id, qualification_id)`) and pay out through the 004 M4 ordinary payout
machine to the wallet of the persona recorded on the qualification,
resolved and frozen at payout preparation.

### 4.4 Megapot beneficiary share

At qualification commit, a Dance qualification enters this flow only after
every §2.4 compatibility guard passes for the exact pool objective frozen by
its session. `streak_only`
or an omitted objective creates no share.

For any admitted qualification, in the same transaction, if the offer has an
active pool leg whose `eligible_activities` includes the activity and whose
`min_score_bps` is met:

1. Resolve the pool's current drawing `d` from the most recent drawing
   observation (§5.2); require `d >= participation_starts_drawing_id`,
   `now < drawingTime(d) − entry_cutoff`, and drawing status `entry_open`.
   Before the participation boundary or outside the window, the qualification
   earns no share in `d` and none in `d+1`; it is simply not a share (no
   rollover, no deferred entitlement). The projection tells the user the
   window is closed before they start.
2. Evaluate eligibility (§8) for the scarce leg.
3. Insert `megapot_pool_shares (account_id, pool_leg_id, drawing_id)` with
   `qualification_id`, `persona_id`, `eligibility_decision_id`. Conflict
   means the account already holds today's share.

Shares consume no budget. A `no_purchase` drawing with zero shares at cutoff
purchases nothing and spends nothing; §5.2 owns the distinct
`funder_fallback` path.

### 4.5 Recipient resolution

Asset and winnings credits are account liabilities. Payout preparation
resolves the wallet of the persona recorded on the share or claim, or the
`fallback_payout_persona_id` frozen on an external-sponsor fallback (014 §5).
If that persona has no EVM assignment, the payout waits in
`recipient_pending` and the persona's first wallet need (014 §4) completes it.
A later persona change or account merge never
redirects a prepared payout; it may redirect a not-yet-prepared credit only
through the audited account-merge path.

### 4.6 Asset whitelist

The testnet operator admission contract is defined in
[015a — Testnet bonus-token admission](015a-testnet-bonus-token-admission.md).
This September 8 amendment supersedes this section's former admitted/suspended
status vocabulary, automatic community-token admission, and assumed bonus seeds.

`reward_asset_whitelist` is keyed by `(chain_id, token_address)`, with immutable
asset identity, environment, metadata, policy version and verification time.
Its statuses are `active` and `retired`; only active-to-retired is permitted.
`asset_kind` is `settlement_usdc` or `bonus_asset`. Settlement admission does not
admit that address as a bonus, and program activation does not implicitly admit
an asset into the song bonus catalog.

V1 bonus admission is operator-only, on Base Sepolia (84532), in test or staging.
Sponsors select active bonus assets returned by ListAdmittedRewardAssets; they
cannot enter custom addresses or admit a token. Empty catalog is a valid result.
Creation rechecks current admission and exact metadata. Retirement removes an
asset from new selection and rejects new legs; it neither erases existing
liabilities nor itself authorizes cancellation, refund, or another transfer.
Production admission and an administrative product surface are later work.

### 4.7 Platform sponsorship (bootstrap model)

`platform_sponsorship_budgets (sponsor_account_id, chain_id, usdc)` is one
ledger per environment held inside the custody wallet:
`funded + winnings_credited − reserved − spent − withdrawn = available`.
It is funded by the sponsor's inbound funding effects and by sponsor
fallback winnings (§5.2). It is a platform asset, kept strictly separate
from user liabilities in the solvency computation:
`custody_balance ≥ user_liabilities + sponsorship_available +
sponsorship_reserved`. `sponsorship_reserved` covers every pending ticket
purchase reservation and every pending sponsor withdrawal, so a purchase
in flight can never spend USDC that also backs user winnings. A sponsor
withdrawal reserves its amount before the payout effect is submitted and
releases it only on confirmed receipt or explicit pre-broadcast failure
(004 §7.2).

- **Auto-attach.** A community policy `auto_pool_leg: on | off` (set by
  `manage_rewards`; platform-operator default may set it for every
  community in the bootstrap phase) attaches, at song publication and
  retroactively on enable, a `megapot_pool` leg with `funding_source =
  shared_sponsor_budget`, `empty_pool_policy = funder_fallback`,
  `tickets_per_drawing = 1`, and the platform's frozen pool terms version.
  Attachment is an enrichment (013 §7) and never touches the
  creation operation. A song owner may opt out (`owner_policy.pool_leg:
  declined`): opt-out sets the leg's `participation_ends_at`, after which
  no further drawings open for it; the leg row, its drawings, snapshots,
  and allocations remain immutable history. Opt-out never removes a leg.
- **Reservation.** Shared-budget legs reserve `count × ceiling` from the
  sponsorship budget at cutoff freeze, not at attachment, so an idle song
  costs nothing. Reservation fails closed with `sponsor_budget_exhausted`
  or `sponsor_daily_ceiling` and the drawing closes `closed_unfunded`.
- **Mandatory ceilings.** `sponsor_daily_ticket_ceiling` (tickets per UTC
  day across all shared-budget legs) and `sponsor_daily_spend_ceiling_atomic`
  are non-null required deployment configuration; attaching a ticket to
  every song otherwise drains the budget in one drawing. Legs are served
  each drawing in the deterministic rotation order
  `sha256(drawing_id ∥ post_id)` ascending, so no song is permanently
  favored or starved by its identifier; unserved drawings close
  `closed_unfunded`, never silently skip.
- **Sponsor winnings.** When the sponsor is the sole frozen beneficiary,
  allocation credits 100% of net winnings to `winnings_credited` on the
  sponsorship budget by ledger row inside custody — no on-chain movement,
  available for the next drawing's reservation immediately. The sponsor
  may withdraw `available` to its configured wallet through the ordinary
  payout machine on request (`sponsor_withdrawal` effect). Automatic
  on-chain reinvestment is a non-goal.
- **Users always win first.** If `n > 0` the sponsor holds no share and
  receives nothing from that ticket, regardless of who funded it.
- **Disclosure.** Every shared-budget pool projection carries the fixed
  string "If nobody qualifies, the sponsor keeps this ticket and any
  winnings." and names the sponsor as the platform.

## 5. Megapot pool leg

### 5.1 Provider facts (verified 2026-08-25; Appendix A is normative)

Purchase: `Jackpot.buyTickets(Ticket[] tickets, address recipient, address[]
referrers, uint256[] referralSplit, bytes32 source)`; the ABI shape is
`Ticket = { uint8[] normals, uint8 bonusball }`, with exactly five unique
normal selections in `1..ballMax` and one bonus selection in
`1..bonusballMax`; v1 submits exactly one ticket; USDC allowance to the
Jackpot contract from the buyer;
cost = `ticketPrice × count` read from `getDrawingState(currentDrawingId())`;
purchase allowed only while `drawingTime > block.timestamp && !jackpotLock`;
otherwise the call reverts. Tickets are ERC-721 held by `recipient` — here
always the platform custody address. Winnings are claimed by the ticket
owner via `claimWinnings(uint256[] ticketIds)`; nothing is sent
automatically. Referral fee and win share are read live (`referralFee`,
`referralWinShare`, 1e18 = 100%); `referralSplit` sums to exactly 1e18.

### 5.2 Drawing lifecycle (per pool leg and drawing)

004 §10.2–10.6 apply verbatim; this section fixes their shape for one song
pool with `tickets_per_drawing = 1`:

```
entry_open -> cutoff_frozen -> committed -> purchase_pending
           -> tickets_confirmed -> drawing_pending -> no_win | winnings_detected
           -> claim_pending -> claimed -> allocated -> credited
entry_open -> closed_no_entries      (no_purchase legs, n = 0)
entry_open -> closed_fallback_ineligible (external fallback sponsor fails closed)
entry_open -> closed_fallback_unavailable (task cannot currently be qualified)
entry_open -> closed_fallback_ceiling (external sponsor daily ceiling reached)
entry_open -> closed_unfunded        (shared-budget reservation refused)
committed  -> closed_purchase_unavailable (deterministic pre-broadcast refusal)
any        -> operational_hold (operator item; never auto-resolves)
```

- Drawing observation: a jobs-worker lane reads `currentDrawingId()` and
  `getDrawingState` on a bounded cadence and persists
  `megapot_drawing_observations (chain_id, jackpot_address, drawing_id,
  drawing_time, ticket_price_atomic, jackpot_lock, observed_at)`. A stale
  observation (> `observation_stale_seconds`) closes entry and blocks
  purchase (`observation_stale`), never reads as healthy.
- Zero shares at cutoff, `empty_pool_policy = no_purchase`: the drawing
  closes as `closed_no_entries`; no snapshot, no commitment, no purchase,
  no spend; the budget stays in the leg and is refunded per §4.2 when the
  offer ends. Zero shares, `funder_fallback`: an external sponsor's legal
  eligibility is re-evaluated under §8. Failure closes the drawing as
  `closed_fallback_ineligible` with no purchase or spend. The interpreter then
  requires `min_score_bps = 7000`, the song to remain published and publicly
  discoverable, and every member of `eligible_activities` to remain available
  for the frozen audio revision. Failure closes
  `closed_fallback_unavailable`. It atomically reserves the external sponsor's
  UTC-day ticket and spend ceilings; refusal closes
  `closed_fallback_ceiling`. Otherwise the beneficiary set is the one-member
  snapshot `[fallback_beneficiary_account_id]`, with the private
  `fallback_payout_persona_id` where required and `fallback = true` recorded
  in the snapshot and commitment; the drawing proceeds through freeze,
  commitment, and purchase exactly as a populated drawing. A snapshot may
  contain the sponsor as the fallback beneficiary only when `n = 0`; a
  sponsor that independently qualifies when `n > 0` appears only as an
  ordinary participant share.
- Cutoff freeze at `drawingTime − entry_cutoff_seconds`: the beneficiary
  set is the shares for `(pool_leg_id, drawing_id)`, canonically ordered
  by `sha256(account_id ∥ pool_leg_id ∥ drawing_id)`; the snapshot stores
  ordered stable commitments (never raw account ids in any published
  artifact), leaf count, `terms_hash`, algorithm version, and
  `snapshot_hash` under domain `pirate.megapot-pool-beneficiary-snapshot.v2`.
  Once frozen, the set cannot change (004 §10.2). A qualification after
  cutoff earns no share in this drawing.
- Commitment: the snapshot hash is published as a durable effect to the
  commitment log configured for the environment (`onchain |
  public_append_only_log`) with an external timestamp before purchase;
  purchase preflight refuses unless `commitment_status = 'published'` and
  the stored set, root, leaf count, and terms hash agree byte-for-byte
  (004 §10.2). The commitment fixes beneficiaries before the outcome is
  known; it does not choose a winner.
- Purchase (first concrete server-signed effect): 004 §10.3 verbatim, plus
  preflight against the frozen deployment identity and live
  implementation code hash (`deployment_attestation_mismatch`),
  `drawing_id` equality (`drawing_rolled_over`), `!jackpotLock`
  (`jackpot_locked`), `drawingTime − purchase_safety_margin > now`
  (`cutoff_safety_margin`), `ticketPrice ≤ max_ticket_price_atomic`
  (`price_above_ceiling`), leg budget covers `count × ceiling`
  (`insufficient_budget`), custody USDC allowance and balance, custody gas
  floor, and for an external fallback the live participation guards and
  per-sponsor UTC-day ticket/spend reservation still hold. Budget and daily
  capacity are reserved before submission; the budget delta and daily-capacity
  reservation release only under the confirmed-receipt or explicit
  no-value-moved rules of 004 §7.2. Ticket numbers are derived server-side and
  deterministically from `keccak256(effect_id ∥ drawing_id ∥ index)`
  reduced into `ballMax`/`bonusballMax`, de-duplicated and sorted, so
  signed bytes are reproducible for exact-byte recovery; the
  `JackpotRandomTicketBuyer` path is not used. `recipient` is the custody
  address; `referrers = [platform_referrer]`, `referralSplit = [1e18]`,
  `source = source_tag`. Receipt validation proves ticket ids, owner =
  custody, and drawing id = reservation; a receipt for another drawing is
  `needs_review`, never success. A submission with no receipt is
  `uncertain`, never `failed`; replay asserts the same `drawing_id` before
  returning the existing row.
- Pre-broadcast terminal refusal: after commitment, `drawing_rolled_over`,
  `drawing_locked`, or `cutoff_safety_margin` closes the drawing as
  `closed_purchase_unavailable` only while no purchase effect, signed bytes, or
  broadcast exists. The same transaction records the terminal reason and
  releases the leg or shared-sponsor reservation and any external or shared
  UTC-day reservation. RPC failure, insufficient allowance, insufficient
  balance or gas, attestation mismatch, and every uncertain broadcast remain
  retry or operator states and retain their reservations.
  The v1 public projection exposes this internal terminal as
  `lifecycle_status = operational_hold` with `state = entry_closed` until the
  parent offer closes; adding an enum value is reserved for a major wire
  version.
- Drawing sweep: after `JackpotSettled` for `drawing_id`, the sweep reads
  each held ticket's outcome (provider data API or chain) and records
  `no_win` or `winnings_detected` with gross tier amounts; a sweep older
  than `sweep_stale_seconds` after settlement opens an operator item.
- Claim (server-signed, 004 §10.4): `claimWinnings(ticketIds)` from
  custody; proceeds are attributed to the claim transaction hash and the
  custody USDC balance delta; `gross = received + referral_accrual` is
  reconciled; referral fees accrue to the separate platform referrer
  address and are never netted into beneficiary proceeds.
- Allocation (004 §10.5, `equal_v1`): `net = received`. For a `fallback =
  true` shared-budget snapshot, `n = 1` and the single allocation goes to the
  sponsorship budget (§4.7), not to a user credit. For a `fallback = true`
  external-sponsor snapshot, `n = 1` and the allocation becomes an ordinary
  USDC credit for `fallback_beneficiary_account_id`, payable only to the
  frozen `fallback_payout_persona_id`. Otherwise `base = floor(net / n)`;
  remainder `r = net − base × n` is allocated one atomic unit each to the
  first `r` beneficiaries in canonical snapshot order. Allocation
  batches are keyed `(pool_leg_id, drawing_id, claim_effect_id)` and unique
  per `(batch, account_id)`; re-running allocation is a no-op on primary
  keys. Every allocation sums exactly to `net`.
- Credit: each allocation becomes a USDC reward-ledger credit for the
  account, keyed `(account_id, allocation_id)`, backed by custody. A credit
  that is never paid out (persona never assigns a wallet, account
  inactive) remains a custody liability indefinitely; it never becomes
  platform revenue by lapse. Any dormancy or escheat rule is open decision
  14.8 and requires a dated amendment before it can run. Custody
  solvency observations (stale > 900 s fails closed) gate payout
  preparation: `custody_balance ≥ outstanding_liability`.
- Payout: the 004 M4 ordinary payout machine, one asset, to the persona
  wallet per §4.5. There is no separate cashout reducer (resolves 004
  §17.3: reuse).
  Amended for participant credits by §5.2a (2026-09-25): they are paid only
  after an accepted participant claim.

### 5.2a Participant claim — claim-time verification amendment, ratified 2026-09-25

Ratified by workspace_owner 2026-09-25 (handoff revision 4). Scope: Megapot pool
participant credits only. Asset bonuses and community-token emissions keep §8.1
and §8.2 as written until separately amended. A person can do Study and karaoke
and hold a Megapot pool share without a palm scan; after a confirmed win the
person sees a fixed USDC amount held in custody and verifies with Very only when
choosing to claim it. The amount never expires. After a successful claim it is
paid to the persona's wallet.

#### Standing rules replaced (Megapot pool participants only)

1. §1 decision summary item 7 and §8.1 admission (ratified 2026-09-06): "All
   monetary activity reward admission requires server-verified
   human.personhood plus credential.subject_unique evidence" no longer applies
   to Megapot pool shares. Its clauses "acquires no
   pool share ... winner allocation or deferred monetary entitlement" and "Do
   not wait until withdrawal to check: an unverified account must never occupy
   a scarce entry or reduce other beneficiaries' shares" are withdrawn for pool
   shares. The verification is moved to the claim (§5.2a).
2. §8.1 product obligation (2026-09-19): for Megapot pools the pre-activity
   message changes from "will not earn monetary rewards without valid Palm
   evidence" to "If your pool wins, your amount is held until you verify to
   claim it." The rule "later verification never backfills a previously rejected
   qualification" no longer affects pool shares, because no pool share is
   rejected for missing verification. It still governs asset bonuses and
   emissions.
3. §8.2 scarce-leg policy: pool-share admission still evaluates the applicable
   action-scoped legal eligibility, including age, geography and disclosure
   requirements. Its Very requirement and offer-scoped subject consumption move
   to the participant claim. External-sponsor and platform fallback checks stay
   as written. Pool copy says "qualifying account" or "one share per qualifying
   account", not "verified account".
4. §8.2 terminal reasons: for pool participants, `verification_missing`,
   `verification_stale`, `verification_failed` and `subject_already_consumed`
   become claim outcomes, not admission outcomes.
5. Participation money-boundary acceptance (2026-09-06): the Megapot consumer's
   expectation "verification_missing with no share" is replaced by the tests in
   this amendment. The asset-bonus and emission expectations stay.
6. The per-offer admission use of `reward_subject_consumptions` for Megapot pool
   shares is removed; that table keeps its asset-bonus and emission uses.
7. Open decision 14.8, for Megapot pool participant credits only: resolved as
   "never expires". A participant credit stays a custody liability until paid;
   no dormancy, escheat or redistribution rule may apply to it unless a later,
   separately reviewed amendment changes the promise prospectively for credits
   created after that amendment. 14.8 stays open for other liabilities.

#### Megapot pool admission (replaces §8.1 for pool shares)

A qualifying activity inside an open drawing's entry window creates one pool
share per `(account_id, pool_leg_id, drawing_id)` without verification
evidence, recording the account's chosen persona on the share. The existing
qualification, score floor, entry window, persona and one-share-per-account-per-
pool rules are unchanged. One account may still hold shares in several song
pools for the same provider drawing (§1). The cutoff freezes the beneficiary set
and publishes its commitment before any purchase; the set never changes after
the outcome.

#### Credits covered

- Participant allocations (`allocation_kind = participant`): subject to the
  user claim in §5.2a.
- External-sponsor fallback allocations: unchanged. The sponsor is already
  required to be a verified account; the credit keeps its existing payout to
  the frozen `fallback_payout_persona_id` and needs no user claim.
- Shared-budget fallback allocations: unchanged; they credit the sponsorship
  budget, not a user.

#### Credit and payout (amends §5.2)

Allocation is unchanged: `equal_v1` allocates `net` across the frozen
beneficiaries. Each participant allocation becomes a custody-backed USDC
credit; the external-sponsor credit and shared-budget fallback keep their
existing accounting.
Participant credits are no longer paid automatically; they are paid only after
an accepted claim (§5.2a). Solvency gating is unchanged, and every unpaid
participant credit, claimed or not, counts in `outstanding_liability`.

#### Participant claim

1. Display. The app shows an amount only after the claim from Megapot, the
   custody receipt and the credit are confirmed. Before that it shows the
   share and the drawing outcome, never a projected amount.
2. Claim acceptance. The claim is an explicit user action on one credit. In one
   transaction the server requires current, server-verified Very evidence
   (`human.personhood` and `credential.subject_unique`, co-referencing the same
   verified provider subject under the reward policy) for the account,
   consumes the claim guard, and records one claim per credit
   (`unique(credit_id)`). The claim is then `accepted`.
3. Idempotency. Repeating the claim on the same credit, by the same account,
   never creates a second claim or consumes the guard again. It returns the
   existing claim and its current payout status (`pending`,
   `recipient_pending`, `submitted`, `confirmed`, `failed_retrying`).
4. Claim guard. One Very subject may accept at most one participant credit per
   `(pool_leg_id, drawing_id)`, keyed on the private verified provider binding
   and subject, with a subject identity stable across accounts in that scope.
   A subject that wins in two pools of the same provider drawing can claim both
   credits, because each belongs to a different pool. This is a new guard; the
   per-offer `reward_subject_consumptions` constraint is not it.
5. Evidence refusal. A claim refused for missing, stale or failed evidence
   leaves the credit unclaimed and claimable later once valid evidence exists.
6. Subject conflict. If the guard for that `(pool_leg_id, drawing_id)` was
   already consumed by another account's claim with the same Very subject, the
   credit moves to `subject_conflict`. The amount stays owed and counted in
   `outstanding_liability`; it never becomes platform revenue and is never
   redistributed. The account may later claim with valid evidence bound to a
   different Very subject that has not consumed the guard in that scope. The
   user is told the claim could not be completed and the amount is held,
   never a false success.
7. Operator exception. A `subject_conflict` credit can otherwise be released
   only through an audited operator decision recorded against that credit
   (actor role, reason, evidence reference, time). The decision can only move
   the credit to `accepted` through the same `unique(credit_id)` claim record,
   so it cannot create a second claim or a second payout, and it cannot
   consume or release another credit's guard.
8. Payment. An accepted claim hands the credit to the existing M4 payout
   machine. Payout preparation resolves the wallet of the persona recorded on
   the share (§4.5), not a wallet frozen at cutoff; with no EVM assignment it
   waits in `recipient_pending` until the persona's first wallet need
   completes it. A payout that fails or stalls is retried or reconciled by the
   machine against the same accepted claim, never needing a second palm scan
   or a second guard consumption. At most one confirmed payout exists per
   credit.

#### Trade-offs

- Very evidence proves provider-attested personhood and provider-subject
  uniqueness only. It does not prove one human per account, and this amendment
  claims no one-human bound. The guard limits acceptance to one participant
  credit per Very subject per pool per drawing; it does not stop one person
  holding many accounts.
- Every qualifying account, verified or not, counts in the equal split. Shares
  held by accounts that never claim permanently reduce every other winner's
  amount; that money stays in custody as a liability. Qualification effort is
  the only built-in brake on share farming.
- Unverified qualifiers can turn a `no_purchase` drawing into a one-ticket
  purchase. Spend stays bounded by the leg budget, ticket price ceiling and one
  ticket per drawing, but it is no longer zero when only unverified accounts
  qualify.
- Unclaimed and subject-conflict credits accumulate as custody liabilities
  without a time limit.

#### Ratified owner decisions

1. Guard scope: per pool per drawing, `(pool_leg_id, drawing_id)`, as §5.2a.4.
2. Abuse: an abuse review of multi-account share farming, its dilution and its
   ticket-spend effects is required before production rewards, with the chosen
   controls recorded. A per-account rate limit alone is not sufficient.
3. Expiry: participant credits never expire, as "Standing rules" item 7.

Launch acceptance covers the full path: no-palm share, ticket purchase,
settlement, win, custody receipt, displayed amount, claim with palm, payout to
the persona wallet, and the winner sending that USDC onward from the wallet,
including how gas is provided. The abuse review in decision 2 is a prerequisite
for production rewards.

### 5.3 Projection states

Pool leg on the song earn sheet: `entry_open (n sharing today's ticket) |
entry_closed | your_share_held | committed | ticket_purchased |
drawing_pending | no_win | won (your share: X USDC) | payout_pending | sent |
operational_hold`. Copy says "Share today's Megapot ticket" / "Join today's
Megapot pool", never "+1 ticket" or "your ticket"; it shows the drawing id,
the entry-window countdown (ending at `drawingTime − entry_cutoff`), the
current beneficiary count (a count only; never identities beyond the
viewer's own standing), the ticket price ceiling, that winnings are
divided equally among that drawing's qualifiers, and for shared-budget
legs the §4.7 fallback disclosure. An external `funder_fallback` leg carries
the fixed copy "If nobody qualifies, the sponsor receives this ticket's net
winnings." The projection also states that the displayed distributable amount
is net of Megapot's observed referral win share and never implies that the
sponsor is the on-chain buyer or NFT owner. `entry_open (0 sharing)` on a
fallback leg is truthful: the ticket will be bought either way. Winnings never appear as
a spendable balance until credited; credits show as the persona's reward
ledger and pay out under the ordinary payout policy.

Erratum 2026-09-01: the public pool projection may additionally show the
observed gross Megapot prize pool and drawing-wide ticket count together with
the observation time. The amount is labeled gross and before Megapot's
observed referral win share, the ticket count is labeled drawing-wide across
all Megapot buyers rather than song-specific, and a terminal drawing's value
is labeled the last observed pre-rollover snapshot rather than its final
jackpot. The settled and distributable amount remains
`net_winnings_atomic`, net of the observed referral win share.

The authenticated external sponsor view additionally shows
`fallback_active | fallback_displaced (n qualifiers) | fallback_won (X USDC) |
fallback_unavailable | fallback_ceiling | payout_pending | sent`. Its funding
action says "Fund this reward with USDC" or "Sponsor this activity", never
"buy your ticket" or "send tickets". It states the maximum drawings and spend,
the fixed 7000 qualification floor, the currently available activities, refund
terms, and that Pirate buys and custodies the NFT. `fallback_displaced` means
the sponsor receives no fallback allocation for that drawing; it does not imply
a loss of unspent campaign budget.

### 5.4 Custody wallet

Custody is one platform-owned server-signed wallet per environment on 8453
under the 004 §11 signer boundary and nonce fence, holding ticket NFTs,
purchase float, and unclaimed or unpaid winnings. It is funded by an
operator funding effect with solvency observations. It is not the persona
paymaster and shares no key with it. Kill switches: `pool_entries_off`,
`pool_purchases_off`, `sponsor_auto_attach_off`, `payouts_off`, each
fail-closed; `payouts_off` also
disables new entries; refunds and claims stay enabled so custody liabilities
drain.

## 6. Community token program

### 6.1 Capability

Spec 012 is amended to define a closed capability union
`community_capability IN (manage_routes | manage_rewards)` with named grant
storage `community_capability_grants (community_id, account_id, capability,
granted_by, granted_at, revoked_at)`. Creation grants both to the creator.
A versioned community policy may delegate `manage_rewards`. Capability is
checked at intent open and again atomically at commit (012 §3.9).
Platform-operator override is a distinct audited path.

### 6.2 Enablement ceremony

A sibling aggregate on the community (012 §3.9 shape), one nonterminal
intent per community:

```
disabled -> launch_pending -> reserve_funding -> active
                                   -> paused | exhausted | insolvent | retired
```

Requirements as 012 requirement rows with generations and opaque ceremony
ids; provider calls run outside every transaction. Requirement kinds:

- `token_identity`: either `launch` (via the launcher port, §6.3) or
  `attach_existing` (an already-deployed plain ERC-20 the funder proves
  control of by a signed message — allowed so an attach-only community is
  not forced through a launch).
- `reserve_funding`: tokens received at the community's vault address
  (§6.4) above `minimum_reserve_atomic`.
- `emission_terms`: `emission_per_qualification_atomic`,
  `per_account_daily_ceiling_atomic`, `per_program_daily_ceiling_atomic`,
  `eligible_activities` (subset of the registry), `min_score_bps` per
  activity (≥ platform floor), `dance_objective_terms` required exactly when
  `eligible_activities` contains `dance`, `starts_at`, `ends_at`.

`dance_objective_terms` is the complete §2.4 `DanceObjectiveTermsV1`, included
in the immutable program-version terms hash. A version naming Dance cannot
activate or receive funding while the registry row is `reserved` or before a
dated compatible `money_admitted` policy exists.

`program_funder_account_id` is explicit and immutable per program version;
that account funds premine, reserve purchases, and launch gas. The platform
pays nothing unless a separately authorized subsidy program names the
community; a subsidy is its own effect with its own ledger.

Commit freezes an immutable `community_token_program_versions` row. Changing
emission terms creates a new version prospectively; qualifications keep the
version active at `qualified_at`.

### 6.3 Launcher port

`CommunityTokenLauncher` is provider-neutral: `prepare(request) →
frozen_request_hash`, `launch(frozen) → job`, `observe(job) → { token
(chain_id, address), provenance }`. Every parameter is frozen in the
request (chain, name, symbol ≤ 8 ASCII, total supply, fair-launch
allocation and duration if the adapter supports them, initial market cap,
creator/revenue recipient, fee split, manager addresses, premine amount and
payer, sniper protection flag) together with adapter id and adapter code
identity. Provider defaults are never relied on: an adapter that cannot
honor a frozen parameter rejects at `prepare`. Adapters are selected per
program by policy after token economics are chosen; Flaunch and Zora
Creator Coins are the candidate adapters (Appendix A). Token identity is
always `(chain_id, contract_address)`; `symbol` is display metadata and is
never derived from a route root.

### 6.4 Reserve vault

One segregated, platform-controlled vault address per community program on
8453 under the 004 §11 signer boundary. The vault holds only that program's
token (and gas). Ledger: `funded − emitted_settled − emitted_reserved −
refunded − retired = available`, observed on chain by a solvency reader;
missing or stale (> 900 s) observation fails emissions closed. The vault is
a platform obligation to the community program, not community custody;
moving the reserve to community-controlled custody is a later spec (Lit v2
or governance).

### 6.5 Emissions

At qualification commit, if the community has an `active` program version
whose `eligible_activities` includes the activity and whose `min_score_bps`
is met, the independent verification and subject-consumption guards of §8.1
pass, and for Dance every §2.4 compatibility guard passes: insert
`community_token_emissions` keyed as §3.2, amount
`emission_per_qualification_atomic`, status `credited`, unless a ceiling or
the solvency gate blocks it (terminal reasons `account_daily_ceiling`,
`program_daily_ceiling`, `reserve_insolvent`, `reserve_observation_stale`).
Ceilings are mandatory non-null values. Credits settle through the 004 M4
credit → payout machine as one-asset batched transfers from the vault to
the persona wallet per §4.5; per-account payout cadence is policy
(`on_request | daily_batch`). Projection states per emission: `earned |
payout_pending | sent | blocked(reason)`.

### 6.6 Program lifecycle

`paused` (by `manage_rewards`): no new emissions; pending payouts continue.
`exhausted`: available reserve below one emission; auto-resumes on funding.
`insolvent`: observed balance below reserved liability; emissions and
payouts stop; operator item opened. `retired`: explicit, audited, follows
§6.7.

### 6.7 Retirement and rotation

Retiring a program, token, vault, or custody address is an explicit
immutable row `(chain_id, token_address, vault_address, quote_cutoff_at,
disposition IN (non_material_test_asset | vault_verified_no_unclaimed_value
| returned_to_funder), authorized_by_role)`; a chain or environment mismatch
alone is never evidence an asset is valueless (legacy 0195/0196). Rotating a
vault or custody wallet requires zero `reserved`, `claim_pending`, or
`payout_pending` rows.

## 7. Streaks and leaderboards

### 7.1 Clock

`account_streak_clocks (account_id, timezone, timezone_updated_at)`. The
pin is per account, not per song or community. Source at first pin: request
body → request geography → UTC. Change allowed at most once per 7 days,
prospective only, enforced by a compare-and-swap committed before the
qualification transaction; the first committed claim wins. `streak_day` on a
qualification is `qualified_at` in the pinned zone.

### 7.2 Aggregates

- `song_streak_days (account_id, post_id, streak_day)` with an
  activity-keyed child `song_streak_day_activities (…, activity, count)`;
  no per-activity counter columns.
- `song_streaks (account_id, post_id, current, best, started_day,
  last_day, total_days, active_until_at)`; alive iff `active_until_at > now`
  where `active_until_at` = local midnight after `last_day + 2` computed by
  DST-safe iteration.
- `community_streak_days (account_id, community_id, streak_day)` earned by
  any qualification in any community song; `community_streaks` with the
  same shape.
- Every asynchronous producer (karaoke provider callback, late study
  finalization) recomputes the streak from the day ledger; incremental
  upserts are not used for out-of-order legs.

### 7.3 Presenting persona

`persona_activity_presentations (community_id, account_id, persona_id)`
mirrors `persona_role_presentations` (014 §7): the account selects
which of its active personas bound to that community presents its song,
community, and Karaoke best-score standings. Explicit activity preparation,
membership or creation establishes an absent initial presentation persona;
joining must preserve an existing valid explicit presentation. The first
qualification does not choose from a global pool. A later change requires active
ownership and the exact community binding, not active membership. An eligible
nonmember may participate and appear in admitted standings without a community
posting proof. Public leaderboard rows carry only `persona_id`, display fields, handle display
identifiers issued by that community, and score or streak numbers. No global
`.pirate` fallback, other-community handle, `account_id`, wallet, sibling
reference, or per-account aggregate that could link siblings is returned.

### 7.4 Ranking and reads

Order `current DESC, best DESC, started_day ASC, persona_id ASC`;
competition ranking (1, 2, 2, 4); dead streaks hidden; the viewer's own
standing is always returned when authenticated (private, `no-store`); every
leaderboard response names its scope (`song` with `post_id`, or `community`
with `community_id`) and the pinned-timezone semantics in a typed field.
Karaoke best-score populations remain account-keyed and revision-scoped under
spec 019, but project the same `persona_activity_presentations` row used here;
the best attempt's performing persona never overrides it.

## 8. Eligibility and compliance hooks

### 8.1 Human verification independently of membership

> Superseded for Megapot pool participants by §5.2a (2026-09-25): pool-share
> admission needs no verification, and the verification, terminal reasons and
> no-deferred-entitlement rules below move to the participant claim for pools.
> This section still governs asset bonuses and community-token emissions.

Ratified by delegated coordinator decision — 2026-09-06. All monetary activity
reward admission requires server-verified human.personhood plus
credential.subject_unique evidence for the beneficiary account under the
versioned reward policy. This includes Megapot pool shares, asset-bonus claims
and community-token emissions. A member with missing/stale/failed reward evidence
is ineligible; a verified nonmember may be eligible. Never derive this decision
from membership, a client verification boolean or leaderboard rank. The currently
admitted evidence is Very under Spec 006; no new proof provider is admitted here.

Evaluate the verification at the transaction that reserves or credits the
benefit, together with its existing uniqueness and economic guards. Record the
reward-only decision and evidence revision. An unverified attempt can commit
qualification, progress, streak and admitted score presentation, but acquires no
pool share, claim, token credit, winner allocation or deferred monetary
entitlement. Do not wait until withdrawal to check: an unverified account must
never occupy a scarce entry or reduce other beneficiaries' shares. Existing
later eligibility rechecks remain in force. A rejected monetary effect must not
roll back the activity's terminal result or its nonmonetary effects.

Product obligation — 2026-09-19 (document-only join policy amendment). Any
account may lack valid Palm evidence: a member admitted through a
document-nationality policy, a Palm-policy member whose evidence is missing or
stale, or a nonmember running an activity without Palm (Spec 019). Before such
an account starts a rewarded activity, the product must say the activity will
not earn monetary rewards without valid Palm evidence, and offer the Palm
scan. Later verification never backfills a previously rejected
qualification, so the explanation comes before participation, not at the
outcome. The admission rule above is unchanged.

Later verification does not backfill a previously rejected qualification. A new
qualifying attempt is evaluated under then-current terms, windows and deduplication
keys. Already validly reserved/credited benefits retain their existing lifecycle;
this amendment does not cancel them or rewrite settled history. The new emission
verification requirement is prospective and must ship with the participation
boundary, before removal of the incidental session-membership barrier.

Keep reward_subject_consumptions and the existing offer uniqueness authorities
for pool/asset admission. Community-token emission verification must likewise
consume a subject-scoped uniqueness guard in the same credit transaction, with
scope (program_id, post_id, activity, reward_period_key), in addition to its
account key and ceilings. Use the private verified provider binding/subject, not
a client value or a public identity. Changing personas or using another account
with the same provider subject cannot create another benefit in that scope.
No leaderboard population is itself a reward-eligible beneficiary set.

The evidence proves provider-attested personhood and provider-subject uniqueness
only. Spec 006 explicitly withholds human.unique and a one-person-one-account
promise until provider evidence and a separately ratified policy justify them.
This rule closes the unverified-account path without claiming a proven one-human
bound. Production money admission, calibration, solvency and legal-policy gates
remain separate and must not be weakened by this correction.

### 8.2 Scarce-leg policy and sponsor checks

> Amended for Megapot pool participants by §5.2a (2026-09-25): pool-share
> admission still evaluates legal eligibility (age, geography, disclosure); its
> Very requirement and offer-scoped subject consumption move to the participant
> claim. External-sponsor and platform fallback checks are unchanged.

Scarce legs (pool share, asset bonus) require an action-scoped reward
policy evaluated at share or claim reservation, reusing the 006 evaluator
with separate decisions, idempotency keys, and audit rows (012 §5 pattern):

- `human.personhood + credential.subject_unique` for the claiming account;
  consumption recorded in `reward_subject_consumptions` against a
  `reward_uniqueness_authorities` row for the offer (Postgres 0009 tables,
  first use).
- `legal_eligibility`: a counsel-controlled configuration keyed by leg kind
  with hooks for age attestation, geography, disclosure acknowledgement,
  and — for pool shares specifically — the disclosures required of a
  platform that purchases lottery tickets and distributes proceeds to
  users. The spec fixes the hook shape, the terminal reasons
  (`verification_missing | verification_stale | verification_failed |
  subject_already_consumed | age_ineligible | geography_ineligible |
  disclosure_unacknowledged`), and fail-closed behavior; the rule values
  are configuration and may be empty in local/test.

An external `funder_fallback` sponsor must be a verified account and pass the
pool legal-eligibility policy when the leg activates and again when a
zero-share drawing freezes. It does not consume a participant reward-uniqueness
slot merely by sponsoring. A failed or stale decision buys no ticket for that
drawing and records `closed_fallback_ineligible`; it never substitutes Pirate
or another account as beneficiary. The dedicated platform sponsor follows the
separate counsel-controlled entity policy and production sign-off rather than
human credential consumption.

The fallback participation-viability guard is separate from legal eligibility.
At activation and every zero-share cutoff, api-next derives public
discoverability and per-activity readiness from the authoritative post and
producer records. Any unavailable named activity, an absent typed Study item
snapshot, a non-ready Karaoke revision, or a non-discoverable song fails
closed. Sponsor input cannot attest around this guard.

Copy says "verified account" or "one share per verified account", never
"one per person". A blocked scarce leg never erases the qualification, an
emission, or a streak day. Production activation of any scarce leg is
additionally gated on the disclosures being present (§13).

## 9. Settlement, journal, signer

Every value-moving effect here — leg funding confirmation, custody ticket
purchase, commitment publication, winnings claim, allocation and credit,
asset and winnings payout, emission payout, refund, custody and vault
funding, retirement — implements 004 §5 verbatim with 004 §6 invariants and
§7 states, and the Megapot machines keep 004 §10.1–10.6 as authority. The
custody ticket purchase is the first concrete server-signed effect (amending
004's 2026-08-18 money/rewards boundary and 000 §11); ordinary USDC payout is
the second, and
together with M3 community purchase they satisfy the 004 §8 extraction
trigger; winnings claim and allocation consume the extracted abstraction.
Signer backend is the 004 §17.1 open decision; Lit remains v2. Pooling
means Pirate carries custody and winnings-distribution liability in
addition to transaction uncertainty, funding, compliance, and support
obligations. Funder fallback makes the external sponsor a participant when a
drawing has no qualifiers; shared-budget fallback additionally makes the
platform a lottery participant in its own right. Every one of these is
journaled, and both participant roles are named items in the legal production
gate (§13).

## 10. Storage sketch (Postgres, forward-only; ordinal assigned at dispatch)

Registry and policy: `activity_registry`, `qualification_policy_versions`,
`reward_asset_whitelist`, `community_capability_grants`.

Qualification: `karaoke_sessions`, `karaoke_attempts`, `study_sessions`,
`study_session_items`, `study_session_answers`, `activity_qualifications`.

Offers: `song_reward_offers`, `song_reward_offer_legs`,
`song_reward_leg_funding_effects`, `song_reward_bundle_claims`,
`song_reward_bundle_claim_legs`, `reward_ledger_credits`,
`reward_payout_effects`, `reward_refund_effects`.

Megapot pool: `megapot_deployment_attestations`,
`megapot_drawing_observations`, `megapot_pool_drawings`,
`megapot_pool_shares`, `megapot_pool_beneficiary_snapshots`,
`megapot_pool_commitment_effects`, `megapot_ticket_purchase_effects`,
`megapot_ticket_inventory`, `megapot_drawing_sweeps`,
`megapot_claim_effects`, `megapot_allocation_batches`,
`megapot_allocations`, `custody_solvency_observations`,
`platform_referral_revenue_ledger`, `platform_sponsorship_budgets`,
`platform_sponsorship_budget_entries`, `sponsor_withdrawal_effects`,
`sponsor_daily_ticket_totals`, `community_auto_pool_policies`.

`sponsor_daily_ticket_totals` distinguishes `shared_platform` from
`external_fallback` and is unique by `(sponsor_account_id, UTC day, kind)`;
external rows conserve both reserved/confirmed ticket count and atomic spend
across every pool leg owned by that sponsor.

Program: `community_token_program_intents`,
`community_token_program_requirements`, `community_token_launch_requests`,
`community_token_program_versions`, `community_token_vaults`,
`community_token_vault_observations`, `community_token_emissions`,
`community_token_emission_daily_totals`, `reward_asset_retirements`.

Streaks: `account_streak_clocks`, `song_streak_days`,
`song_streak_day_activities`, `song_streaks`, `community_streak_days`,
`community_streaks`, `persona_activity_presentations`.

Eligibility: existing `reward_uniqueness_authorities`,
`reward_subject_consumptions`; new `reward_eligibility_decisions`. The participation
correction extends subject-consumption authority to community-token emissions
under §8.1 without rewriting existing offer-scoped authorities.

All amounts are `NUMERIC(78,0)` or bigint branded by `(chain_id,
token_address, decimals)`; never cents for community tokens. Migrations are
forward-only and use ordinary transactional indexes for newly created empty
tables. The current migration runner is transactional, so an index on an
existing hot table that genuinely requires `CREATE INDEX CONCURRENTLY` must
use a separately reviewed nontransactional operational path; it may not be
placed in the ordinary migration or invented by this slice.

## 11. Wire surface sketch

Commands (all persona-scoped idempotent and exact-community-bound, 014 §5 and
§11): start/submit study session; karaoke envelope/finalize (004); open offer;
add leg (returns the inbound funding instruction); top up leg; pause/end offer;
enable program
(intent/requirement/commit per 012 shape); pause/resume/retire program; set
presenting persona; set streak timezone; request payout.

Projections: song earn sheet (`program` chip "N $SYM per activity, up to M
today"; per-activity `available | in_progress | qualified | claimed |
ineligible`; asset bundle `available | claimed | unavailable | exhausted |
expired`; pool leg states §5.3; asset leg `available | reserved |
payout_pending | sent`); community program summary; song and community
leaderboards (§7.4); private reward ledger, shares, and payout history
(account, `no-store`). Contracts land in `packages/contracts` first; Solid
consumes the generated client only.

## 12. Implementation ownership and order

Slices, each with separate api-next and Solid task records:

1. **Spec landing** (control plane): this spec, dated amendments, README,
   task registration. No api-next slot.
2. **Qualification and streaks** (api-next `rewards/qualification`; Solid
   `rewards/activity-ui`): activity registry, policies, karaoke and study
   producers in Postgres, `activity_qualifications`, streak tables and
   reads, presenting persona, leaderboards. No money moves. Ships alone.
3. **Song offers** (api-next `rewards/song-offers`; Solid
   `rewards/earn-sheet`): whitelist, offers, legs, inbound funding, asset
   bundle claims, pool shares, eligibility hooks, drawing observation,
   snapshot and commitment, deployment attestation, custody purchase on
   Base Sepolia (first server-signed effect), asset credit → payout
   (second), extraction of the shared journal abstraction (004 §8), then
   sweep, claim, allocation, credit, winnings payout, refunds.
4. **Community token program** (api-next `rewards/community-tokens`; Solid
   `rewards/program-ceremony`): capability grants, ceremony, launcher port
   with the first adapter, vault, emissions, ceilings, retirement.
5. **Later**: dance producer amendment; weighted allocation; Lit v2
   signer; community custody.

api-next owns reducers, graders, qualification, consumption, effects,
migrations, contracts, and Postgres/workerd tests. Solid owns attempt UX,
evidence submission, and projections; it never computes or submits a
settlement score. Shared ports remain coordinator-mediated. Worktree names
replace the superseded names in 001 §9.

## 13. Acceptance

- Postgres tests: replaying or concurrently finalizing the same karaoke
  attempt or study completion yields one qualification, one emission, one
  bundle claim, one pool share, one song day, one community day. Two personas
  of one account yield one of each.
- Qualification-slice authority: a browser-submitted score is rejected and a
  Durable Object or provider callback cannot directly insert a qualification;
  only the server reducer over bound evidence may commit it. A slice-2
  composition test proves that no signer, chain purchase, payout, token
  emission, or other money effect is reachable.
- Study fixtures cover zero and nonzero exercise counts, the exact
  `max(1, ceil(0.70 × qualifying_exercise_count))` threshold, the derived
  `score_bps`, and exact-count evidence. Dance has no producer, command, or
  visible Solid state in this slice.
- The worked example in §3.2 passes as a fixture: three accounts, one
  ticket, 900 USDC net → three credits of 300; 901 net → 301/300/300 in
  canonical order; one account → 901; the sum always equals `net`.
- A qualification after cutoff earns no share in that drawing and no
  deferred share. A `no_purchase` drawing with zero shares purchases
  nothing and the offer's terminal refund returns unspent budget to funders
  pro rata. A `funder_fallback` drawing with zero shares freezes a one-member
  sponsor snapshot, commits, and purchases; with one or more user shares the
  sponsor appears nowhere in the snapshot unless it independently qualified
  through the same participant rules.
- Platform fallback fixture: shared-budget ticket, zero qualifiers, 900 USDC
  net → `winnings_credited += 900` on the sponsorship budget inside the
  same reconciliation, available to the next drawing's reservation with no
  on-chain movement; a `sponsor_withdrawal` of 500 pays through the
  ordinary payout machine and leaves 400 available; user liabilities are
  unchanged throughout and the solvency check counts both.
- External fallback fixture: one verified sponsor funds a `leg_budget` pool,
  zero qualifiers, 900 USDC net → one 900 USDC credit for the sponsor account
  payable only to its frozen persona; the same drawing with three qualifiers
  yields only three 300 USDC participant credits and no sponsor fallback
  credit. Replay creates neither a second credit nor a second purchase.
- Anti-brokerage activation: an external fallback with `min_score_bps =
  10000` or `6999` is rejected with `fallback_score_policy_not_permitted`;
  7000 is accepted. A leg naming Dance before its producer exists, Study
  without a nonempty typed item snapshot, Karaoke without a ready scoring
  revision, or a non-discoverable song is rejected with the typed unavailable
  reason. Removing the song from public discovery or losing any named
  activity before a zero-share cutoff closes `closed_fallback_unavailable`
  and spends nothing.
- External sponsor ceilings: reservations across several songs share one
  sponsor/UTC-day counter. Exactly the configured ticket and atomic-spend
  limits may proceed; the next zero-share drawing closes
  `closed_fallback_ceiling`. An uncertain broadcast retains both reservations,
  and a proven pre-broadcast no-value-moved terminal releases both.
- A third-party top-up on a shared-budget leg is rejected. A top-up from
  another account on a `funder_fallback` leg is rejected with
  `fallback_sponsor_mismatch`; a multi-funder leg is `no_purchase`. A stale or
  failed external-sponsor eligibility decision at zero-share cutoff closes
  `closed_fallback_ineligible` without purchasing and preserves refundable
  budget.
- Pool cardinality: a second active `megapot_pool` leg in the same offer is
  rejected with `pool_leg_already_active`, including when it names another
  funder. Ending the first leg permits a later non-overlapping leg and preserves
  all first-leg history.
- Auto-attach: enabling `auto_pool_leg` attaches a shared-budget leg to
  every published song in the community; an owner opt-out sets
  `participation_ends_at`, opens no future drawings, and preserves the leg
  and all history; an idle song reserves nothing. On a day where 12 songs
  exist and the daily ticket ceiling is 10, exactly 10 drawings purchase in
  `sha256(drawing_id ∥ post_id)` order and 2 close `closed_unfunded` with
  an operator-visible count; over two drawings the excluded set differs.
- Solvency: a pending ticket reservation plus a pending sponsor
  withdrawal are both counted as `sponsorship_reserved`; a fixture where
  `custody_balance` covers user liabilities and available but not the
  reservation blocks the purchase, never the user payout.
- Owner opt-out on a sponsored leg sets `participation_ends_at`, opens no
  further drawings, and leaves every historical row intact.
- An allocated credit with no payout remains an outstanding custody
  liability in the solvency computation indefinitely; no job converts it
  to revenue.
- A qualification with no term-matching, inventory-available asset leg
  creates no claim row; emissions, shares, and streaks still land.
- Funded asset legs reject a missing or empty `eligible_activities`, a
  missing or incomplete `min_score_bps`, a map-key mismatch, an activity not
  admitted by the registry when terms freeze at funding, or a threshold outside
  `0..10_000`.
- A qualification whose activity is omitted from a leg, or whose score is
  below that leg's threshold, creates no asset claim when no other
  term-matching, inventory-available asset leg exists. Emissions, pool
  shares, and streaks still proceed.
- A later eligible qualification may claim after an earlier qualification
  found no term-matching asset leg; the earlier mismatch did not consume
  `(account_id, offer_id)`.
- A mixed-leg fixture proves that a claim consumes only term-matching,
  currently available legs. A leg unavailable on an earlier qualification is
  not delivered retroactively. If that qualification created no bundle claim,
  a later term-matching qualification may claim the leg after it becomes
  available. A leg added after a claim is never delivered to that claim.
- A term-matching, inventory-available leg blocked by §8 records its terminal
  reason and consumes the account's bundle claim under the unchanged §4.3
  ordering; it creates no reservation or credit and does not block emissions,
  shares, or streaks.
- The broad Study/Karaoke configuration
  `{study, karaoke}` / `{study: 7000, karaoke: 7000}` preserves the current
  any-eligible-activity behavior and account-level deduplication.
- Boundary fixtures cover a score one basis point below and exactly equal to
  each leg threshold. Exact-command replay and concurrent qualifying
  finalization still produce at most one bundle claim and one reservation per
  consumed leg.
- The enabled producer set remains `study | karaoke`. The registry contains
  one `dance` row in state `reserved`, with no producer, current policy,
  qualification insert, funded leg term, program term, or visible Solid state.
  Concurrent attempts to create a Dance qualification fail closed.
- A shadow Dance terminal result creates private bounded diagnostics only. It
  creates no qualification, streak, leaderboard fact, claim, share, emission,
  reservation, custody entry, or money effect.
- A future `streak_admitted` passing result persists
  `reward_admission = streak_only`, may advance the ordinary song and community
  streaks, and is rejected by asset, pool, and emission consumers even if every
  activity, score, scope, and inventory fact otherwise matches.
- A future funded Dance objective cannot activate until a dated compatible
  `money_admitted` policy exists. It rejects a missing or incomplete
  `DanceObjectiveTermsV1`, a threshold below the captured platform floor, a
  policy/calibration/checksum mismatch, a wrong song or audio revision, an
  invalid `specific` choreography revision, or a reserved producer state.
- `any_policy_accepted` accepts an exact ready revision that was selectable at
  session creation and matched the song, audio, and owner-policy contract.
  `specific` accepts only its exact frozen choreography revision. Neither scope
  follows the current active or featured pointer.
- A `reward_eligible` session freezes every compatible objective before
  capture. An omitted or later-created objective never pays it, a snapshot
  reserves no inventory, and a `practice` session is permanently streak-only.
- Promotion, a lower later threshold, or new inventory never upgrades an
  earlier session, qualification, claim, share, or emission. A new policy,
  calibration, checksum, floor, or scope requires a new objective version.
- Existing account uniqueness, persona projection, clocks, eligibility,
  compliance, ceilings, inventory, custody, solvency, and money invariants are
  exercised unchanged for Dance fixtures; sibling personas cannot multiply an
  effect.
- A leg added after a claim is not received by that account; a pool leg
  added later freezes `participation_starts_drawing_id` and earns shares only
  from the next drawing.
- Snapshot and commitment: purchase refuses unless the commitment is
  published and the stored set, hash, leaf count, and terms hash agree
  byte-for-byte; the published artifact contains no raw account id; a
  share inserted after freeze is impossible by constraint.
- Purchase: preflight fails closed on every reason in §5.2; a receipt
  naming another drawing or another owner lands in `needs_review`; a
  submission without receipt is `uncertain`; exact-byte re-broadcast
  reproduces identical calldata including ticket numbers; the budget delta
  releases only on confirmed receipt.
- Claim and allocation: `gross = received + referral_accrual` reconciles;
  referral revenue is in its own ledger; re-running allocation is a no-op;
  a payout is prepared only while custody solvency covers outstanding
  liability; a stale custody observation blocks payouts.
- Emission ceilings are non-null in every program version fixture; a stale
  vault observation blocks emissions with `reserve_observation_stale`.
- Streak: DST transitions, the 7-day timezone change rule, first-commit
  wins on concurrent pins, out-of-order karaoke finalization recomputed
  from the ledger, pre-change qualifications retain the old pinned zone while
  later qualifications use the new zone, one song day is earned across two
  distinct same-day attempts or activities, and one community day is earned
  across two songs.
- Public leaderboard and pool projections contain no `account_id`, wallet,
  or sibling linkage; beneficiary counts are counts only; private standing
  responses carry `no-store`.
- Activity qualification, presentation, and leaderboard fixtures reject an
  unbound, foreign, suspended, retired, or wrong-community persona before any
  effect. Two target-community personas remain one account row. The activity
  and Karaoke best-score views use the same presentation persona and expose no
  global or other-community handle.
- Scarce-leg eligibility failures block only that leg and record the
  terminal reason; copy fixtures never say "per person", "+1 ticket", or
  "your ticket". External-sponsor fixtures say "Fund this reward with USDC"
  or "Sponsor this activity", expose the fallback state only to the sponsor,
  and never describe that sponsor as the on-chain buyer or NFT owner.
- Capability: opening an offer leg or program intent without the required
  capability fails at open and again at commit; revocation before commit
  fails commit.
- Production activation gate (per environment, dated): deployment
  attestation recorded; Base 8453 admitted by the 014 amendment; legal
  disclosures configured for pool shares and asset legs, including the
  proceeds-distribution, external-funder fallback, referral-win-share, and
  sponsor-participant disclosures, and counsel sign-off recorded for both the
  supported external-sponsor model and the platform acting as lottery
  participant; the external-sponsor referral allocation decision is resolved
  into a frozen terms-policy version rather than remaining open; custody and
  vault solvency observers live; kill switches exercised; a
  real testnet-to-mainnet claim-and-payout proof or a countersigned
  bounded-risk waiver; the evidence-based minimum 24-hour staging closeout per
  004 §15.

## 14. Open decisions

1. Signer backend for v1 production (004 §17.1 unchanged).
2. Launcher adapter per program (Flaunch vs Zora vs both) and token
   economics defaults; premine sizing guidance for funders.
3. `entry_cutoff_seconds`, `purchase_safety_margin`, `observation_stale_seconds`,
   `sweep_stale_seconds`, custody gas floor.
4. Commitment publication venue per environment (`onchain` vs
   `public_append_only_log`) and its cost.
5. Resolved 2026-08-25 by workspace_owner: a pool share is per
   `(account_id, pool_leg_id, drawing_id)`; shares reset each drawing; the
   same account may join several song pools for one drawing; sibling
   personas deduplicate at the account; post-cutoff qualifications never
   roll into the next drawing; asset legs stay once per `(account_id,
   offer_id)`.
6. Payout cadence defaults (`on_request` vs `daily_batch`) per asset.
7. Finality thresholds on Base for purchase, claim, and payout receipts.
8. Fee, dust, canceled-pool, and long-term custody liability policies
   (004 §17.4 unchanged), including whether allocated-but-unpaid winnings
   ever leave custody by a dormancy rule. Until decided they remain
   liabilities; silent conversion to platform revenue is prohibited.
   Resolved for Megapot pool participant credits by §5.2a (2026-09-25): they
   never expire unless a later, separately reviewed amendment changes that
   prospectively. Still open for other liabilities.
9. Dance producer, evidence, and policy.
10. Amended 2026-08-25 by workspace_owner: the shared-budget sponsor is a
    dedicated platform sponsor account, never a personal user account. A
    `leg_budget` fallback instead has one immutable external sponsor account
    and frozen payout persona. The numeric `sponsor_daily_ticket_ceiling` and
    spend ceiling remain required deployment configuration, not spec values.
11. Referral allocation for externally sponsored pools. V1 currently keeps
    `referrers = [platform_referrer]`; whether the external sponsor receives
    some or all of the Megapot referral fee and win share requires a later
    explicit terms and accounting decision. Fallback beneficiary status alone
    does not change referral ownership. Production activation of an external
    `funder_fallback` leg is blocked until this decision is resolved, versioned,
    frozen into the leg terms, and disclosed before funding.

## Appendix A. Provider facts

Verified 2026-08-25 and re-verified at landing against
`llms.megapot.io/contracts/reference` and the Flaunch SDK `addresses.ts`.

Megapot v2 (Base 8453): Jackpot `0x3bAe643002069dBCbcd62B1A4eb4C4A397d042a2`;
staging Jackpot `0xCd43b692e005A69aB066F62e92551D5EFD8B69B6`; Base Sepolia
84532 Jackpot `0x465dA3c859f193A3807386387bEE941B2A4c3279`, test USDC
`0x036CbD53842c5426634e7929541eC2318f3dCF7e`; USDC on 8453
`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`. Reads:
`currentDrawingId()`, `getDrawingState(id)` → `{prizePool, ticketPrice,
edgePerTicket, referralWinShare, referralFee, globalTicketsBought, lpEarnings,
drawingTime, winningTicket, ballMax, bonusballMax, payoutCalculator,
jackpotLock}`. Cadence and each drawing's `drawingTime` are read live and are
never hard-coded to 17:00 UTC; anyone calls `runJackpot` (Pyth entropy), then
`JackpotSettled` and `NewDrawingInitialized` identify settlement and rollover.
Winnings are
claimed by the ticket owner with `claimWinnings(uint256[])`; the ticket NFT
burns on claim. Data API `GET https://api.megapot.io/v1/rounds/active`,
`/v1/wallets/{addr}/tickets`, `/v1/wallets/{addr}/wins?claimed=false`;
unauthenticated 10 req/min. Tickets are never free; no zero-price
primitive; the v1 "free to play" product is retired. Referral fee and win
share read live. Megapot v1 `purchaseTickets(address,uint256,address)` at
`0xbEDd4F2b…` is retired and must not be targeted. The provider's app may
require KYC to cash out from its own wallet product; this does not apply
to custody claims but must be disclosed where relevant.

Flaunch (Base 8453 / Base Sepolia 84532): REST
`POST https://web2-api.flaunch.gg/api/v1/{chain}/launch-memecoin` (`symbol` ≤
8 chars, `marketCap` USDC default 10,000, `creatorFeeSplit` bps,
`revenueManagerAddress`, `feeSplitManagerAddress`, optional
`fairLaunchDuration`, and optional `fairLaunchSupply`); provider defaults are
facts to freeze, not values an adapter may inherit implicitly. The SDK exposes
`initialTokenFairLaunch` and `premineAmount`, and deprecated nonzero
`fairLaunchPercent` on 2026-01-13; creator revenue is paid in ETH via a
revenue-rights ERC-721; managers: RevenueManager
`0xc8d4B2Ca8eD6868eE768beAb1f932d7eecCc1b50`, TreasuryManagerFactory
`0x48af8b28DDC5e5A86c4906212fc35Fa808CA8763`, AddressFeeSplitManager
`0xfAB4BA48a322Efc8b25815448BE6018D211e89f3` (Base), as recorded by SDK
`addresses.ts` at commit `90cb9c99001ba11e681b8f98ac28fc257bf527ea`.
The launcher holds no
tokens unless it premines (paid in ETH at the fixed price).

Zora Coins (Base): fixed 1B supply; Creator Coins vest 500M to the creator
over 5 years; Content Coins allocate 10M to the creator. Candidate adapter
when "the community holds a reserve" is the requirement.

## Appendix B. Legacy pitfall register (design-against list)

Double payment after a capacity revert recorded `failed_onchain`; timeout
recorded as `failed`; idempotent replay without asserting the drawing;
verifier checking a transaction against values decoded from itself;
"yesterday" computed in the viewer's timezone; timezone rule enforced in
one of two code paths; per-activity counter columns; timezone pinned per
song; closed activity enum blocking dance; `'either'` occupying two
objective slots; migration ordinal collision across repositories; NULL
asset descriptor meaning "legacy"; stale reconciler resurrecting expired
exposure; testnet addresses armed in production configuration; referral
share silently netted from winnings; no Megapot deployment attestation;
draft pools cancelable only at zero counters; ceiling reservation
over-reserving budget without release.


## Participation money-boundary acceptance — 2026-09-06

> For the Megapot consumer, the expectation "verification_missing with no share"
> is replaced by the §5.2a claim tests (2026-09-25). Asset-bonus and emission
> expectations below stand.

Composed tests use an account that has never completed Palm and has no membership:
its activity, qualification, progress and admitted standings succeed, while all
three monetary consumers record verification_missing with no share, claim or
emission credit. A verified nonmember can pass the independent reward policy;
a membership row alone cannot. A top-ranked unverified account cannot enter a
money allocation via standings. Two accounts mapped to the same verified subject
cannot duplicate a benefit in its defined scope. Verify that failed monetary
admission cannot roll back activity completion, later verification does not
backfill a rejected qualification, and posting still requires ordinary membership.
These cases must pass before accepting the participation runtime change that
removes activity membership guards.
