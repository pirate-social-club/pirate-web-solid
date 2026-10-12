# Spec 021 amendment draft: owner verdicts for Dance attempts (v1)

Status: product decisions settled by the workspace_owner on 2026-09-30. Not
ready to land. The money route, funder classes and replay rules are open, along
with the technical items under "Open before landing", all found by an
independent review on 2026-09-30.

Target once ratified: a dated section of
`docs/specs/api-next/021-dance-choreography-and-qualification.md`, with
conforming edits to Specs 010, 015 and 024.

## Why

Spec 021 assumes a calibrated machine grader. None exists. The standalone
`dance-grader` prototype and the legacy dance-grader service use MediaPipe, but
an audit on 2026-08-30 found the first gameable (a reversed reference scored
higher than an honest attempt, and hiding the body raised the score) and the
second dark, with provisional calibration and synthetic data only. The api-next
shadow grader suppresses every outcome. A human verdict is the smallest honest
grade, but it changes who sees an attempt, so Spec 021 must be amended.

## The flow

```
 Community ▸ Post ──▶ Song ──┬─ Regular video ──▶ Record or upload ──▶ Review ▸ Publish ──▶ Home
                             ├─ New dance ──────▶ Pick its part ▸ Record ──▶ Review ▸ Publish ──▶ Home
                             │                     (followable once playable and its part is verified aligned)
                             └─ Existing dance ─┐
 Feed ▸ Dance ──────────────────────────────────┴▶ Record to its fixed part ──▶ choose one:
                                                     ├ Post only ─────────▶ Publish ──▶ Home (credited, not graded)
                                                     ├ Submit for review ─▶ "Sent for review" ▸ Done
                                                     └ Submit and post ───▶ Publish ──▶ Home, and "Sent for review"

 Later, private to the dancer on that dance's page: Waiting · Passed · Not passed · Expired.
 A reward, if one results, shows on the wallet page.
```

Persona is inherited, never chosen in the flow. It is the active persona for the
dance's community, frozen at session creation (§5.1). If none is prepared for
that community, preparation happens before the camera opens.

## Settled decisions

1. Grading mode. `moderator_verdict` is the v1 grading mode. It is frozen per
   session with the other §5.1 terms and attached to the qualification-policy
   version, not the choreography revision. The automated path stays shadow.

2. Reviewer. The reviewer is the community's owner. No moderator role exists in
   Spec 010 (`community_role_assignments` creates and resolves only `owner`, and
   `moderation.act` requires an active owner assignment), so v1 is owner-only.
   The dancer is excluded by account, not persona, and authority is rechecked
   when the verdict commits. An owner has no eligible reviewer for their own
   community's dances, so the owner is never offered Submit for review or Submit
   and post there; Post only remains.

3. Three choices after recording an existing dance. Post only publishes a
   credited take with no grade (Spec 024 D1). Submit for review sends the
   recording privately to the owner. Submit and post does both with the same
   recording. The choice is made at Submit, because a verdict can take days and
   there is no later moment to offer posting. Publication uses the existing Post
   path unchanged: sampled-frame safety, then automatic publication. This
   replaces Spec 024 Phase 3's post-after-grade order for this mode.

4. Publication is independent of the verdict. Passing does not control
   publication, failing does not remove a post, and the verdict never appears on
   the public post (Spec 024 D4).

5. Screening before any person sees a private attempt. A private-only submission
   passes the same sampled-frame gate as public videos before the owner can see
   it. A flagged attempt goes to platform hold and is never shown to the owner.
   OpenAI's moderation endpoint accepts text and images, not video; the gate
   checks three extracted stills and is not child-safety detection. That limit
   is accepted here as it is for public videos (Spec 024).

6. Visibility and retention. A private attempt is visible only to the dancer and
   the community's owner, through short-lived signed access. It is never listed,
   never attached to a Post unless the dancer chose Submit and post, and never
   used for training. The existing durable cleanup path deletes it at every
   terminal state, except that a flagged attempt is retained under the
   platform-hold rules. Deleting the private attempt never affects a post made
   from the same recording: Submit and post hands the recording to the Post
   path as its own object, with ordinary Post retention. For this mode only, this supersedes the §0 exclusion of
   raw-video review and the §11.1 statement that raw media is unavailable for
   review.

7. Consent at Submit. The owner chose "Only this community's reviewers will see
   this. It's deleted after they decide." It must be corrected before landing:
   the reviewer is the owner, the video is public too under Submit and post, and
   a safety flag is not a proven violation. Proposed, pending the owner's
   approval: "The community owner will review this recording. Your private copy
   is deleted after review or expiry. Videos flagged by safety checks may be
   retained." followed by the chosen publication line, either "This video won't
   be posted." or "This video will also be posted if it passes safety checks."

8. Review window and states. Seven days from upload. States in this mode:
   `created -> consented -> awaiting_upload -> uploaded -> screening ->
   awaiting_review -> reviewed | review_expired | withdrawn`, with `screening ->
   held`, `uploaded -> withdrawn`, and the existing expired, abandoned and
   processing_failed edges. `reviewed` carries `passed | not_passed` and is
   terminal: no re-review and no restore. There is no reviewer note.

9. Result. There is no verdict screen. The dance's page shows the dancer, and
   only the dancer, their latest attempt's state: waiting, passed, not passed or
   expired.

10. A pass is a qualification, not a payout. It can satisfy a reward only when
    every Spec 015 gate holds: the dancer's human verification, a compatible
    reward, rewards enabled and an open entry window. The wallet page shows a
    reward only when one results.

11. Funding limit. A moderator-verdict qualification can satisfy only rewards
    funded by that community or by the song's owner, never platform-funded
    pools. How to express this is open item B.

12. Dance readiness in this mode. A new dance becomes followable once its public
    video is playable and its fixed song section is verified aligned. Pose
    processing (§4.2 steps 5 and 6) is not required until an automated grader is
    admitted. Publication and alignment checks remain. For this mode only, this
    supersedes Spec 024 D2's tie between followability and reference processing.

13. Video posts carry no text field.

## Open before landing

These came from the independent review and are not settled.

A. Money route (blocking). Spec 021 §1 decisions 6 to 8, §7.2 and §8.1 require a
   numeric score, calibration and a money-admitted policy. Spec 015 §2.1 requires
   `score_bps`; §2.4 `DanceObjectiveTermsV1` requires `min_score_bps`,
   `platform_floor_bps` and calibration identity; and §4.2, §6.2 and Appendix A
   item 8 reject funding while `dance` is reserved. Needed: a separate
   `moderator_verdict` qualification-policy family with its own registry,
   producer, streak and money admission; a defined `score_bps` for a pass; and
   objective terms that freeze the accepted grading modes.

B. Funder classes (blocks decision 11). Spec 015 funders are accounts, not
   communities. Legs can be topped up, and added by other members, after terms
   freeze. Megapot `leg_budget` pools are user-funded, not platform-funded. Pool
   entry skips human verification (§5.2a). Needed: defined funder classes,
   accepted grading modes frozen at funding, top-ups restricted to the same
   class, and an explicit rule for every Megapot leg.

C. Replay, cue and limits. Someone could submit the public reference or another
   person's recording, and the owner might pass it. Cue and hash checks reduce
   this but do not prove the dancer recorded the attempt; that stays open. Needed: keep the §5.3
   start cue; compare exact and transcoded hashes against the reference and
   known takes; state which §5.1 frozen terms become null and which §6.2
   reward_mode applies; and set per-account submission and per-owner review
   limits (§6.4).

D. Review mechanism (technical). Attempts do not fit the frozen text moderation
   case contracts: `TextModerationActionV2`, target statuses,
   `ModerationCaseEvidenceV1`, the open and hidden views, and rating-gated
   previews. Choose a versioned action contract with a Dance evidence variant,
   or a small review aggregate that reuses only the capability check and the
   idempotency ledger.

E. Races and edges (technical). Verdict against deadline, withdrawal and a §4.1
   reference cutoff must settle in one reducer fenced by revision, with the
   deadline compared inside the commit. Also: account erasure during review
   (Spec 023); the §5.1 one-active-session rule blocking a retry for up to seven
   days; entry window and verification evaluated at commit with no backfill; and
   the Spec 015 §8.1 warning before a rewarded activity starts.

F. Conforming edits and acceptance. Spec 021 §0, §1, §2, §4.2, §5.1, §5.2, §5.3,
   §6.4, §7, §8, §8.2, §9.2, §11.1, §12.3, §13, §14 and Appendix A; Spec 015
   §2.1, §2.4, §4.2 and §6.2; Spec 010 §2, §4.1 and §7; Spec 024 Phases 2 to 4
   and D2; and new §14 acceptance criteria.

## Follow-on work (planned task records)

- `dance-moderator-verdict-amendment`: resolve A to F and land this amendment.
- `api-dance-moderator-verdict`: implement it in api-next after ratification.
- `solid-video-create-shared-flow`: the shared creation flow in Solid, with the
  Dance ending as a labelled prototype until the API lane lands. The existing
  planned `solid-dance-attempt-shadow` record needs rescoping to this mode once
  the amendment is ratified.
