id: dance-moderator-verdict-amendment
title: Ratify moderator pass or fail as the first Dance grading mode
status: planned
repository: pirate-workspace
area: dance
parent: dance-reserved-integration-amendments
priority: normal
worktree:
branch: spec/dance-moderator-verdict
owner_role: workspace activity specification coordinator
coordination: exclusive
blocked_by:
updated: 2026-09-30
closed_at:
review_after: 2026-10-14

On 2026-09-30 the workspace_owner chose a community owner's pass or fail as
the first Dance grading mode, because no calibrated pose grader exists. The
standalone dance-grader prototype and the legacy dance-grader service both use
MediaPipe, but an audit on 2026-08-30 found the first gameable and the second
dark with provisional calibration, and the api-next shadow grader suppresses
every outcome.

The draft is at `~/Documents/agents/handoffs/SPEC-021-MODERATOR-VERDICT-AMENDMENT-DRAFT-2026-09-30.md`. Its settled decisions, all owner rulings of 2026-09-30:
the owner of the dance's community reviews, since Spec 010 has no moderator
role; after recording an existing dance the dancer chooses post only, submit
for review, or submit and post the same recording, at Submit; passing does not
control publication, failing does not remove a post, and the verdict never
appears on it; private-only submissions pass the sampled-frame safety gate
before the owner sees them; a seven-day review window with terminal verdicts;
no verdict screen, but the dancer alone sees their latest attempt's state on
the dance's page; a pass is a qualification, not a payout, and can satisfy only
rewards funded by that community or the song's owner; a new dance is followable
once its video is playable and its section is verified aligned, with no pose
processing until an automated grader is admitted; and video posts carry no text
field.

An independent review on 2026-09-30 found problems now listed in the draft as
open items A to F: the money route through Spec 015 qualification policy and
objective terms, funder classes, replay and start-cue rules and limits, the
review mechanism against the frozen text moderation contracts, races and edges,
and the full conforming-edit and acceptance list. The consent wording also needs
correcting; the draft proposes wording from a second review that names the
owner, keeps posting separate and does not treat a safety flag as a proven
violation.
Resolve A to F, get the owner's approval on the corrected wording and any new
product question they raise, then land the amendment as a dated section of
Spec 021 with conforming edits to Specs 010, 015 and 024, independently
reviewed again before landing.

Do not start api-dance-moderator-verdict before ratification. This task
authorizes no code, deployment or reward change; rewards stay disabled wherever
they are disabled today.

Second review, 2026-09-30. A read-only reviewer confirmed the rewrite at
`4de5091` and added two rules now in the draft: deleting a private attempt never
affects a post made from the same recording, and an owner is never offered a
review submission on their own community's dances. It also confirmed that cue and
hash checks reduce replay but do not prove the dancer recorded the attempt.

Record of an unauthorized write, 2026-09-30. The workspace_owner rejected a tool
call that would have appended the first review's findings to the draft and to
this record, and the harness reported it unwritten. The same text was later
found on disk in both files, uncommitted, with the draft modified at 17:57. How
it was applied is not known. The owner afterwards authorized a full rewrite,
which superseded that text in `4de5091`; that later authorization does not make
the earlier write authorized.
