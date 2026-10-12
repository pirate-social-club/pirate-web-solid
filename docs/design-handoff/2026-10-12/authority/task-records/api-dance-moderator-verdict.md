id: api-dance-moderator-verdict
title: Implement moderator pass or fail for Dance attempts in api-next
status: planned
repository: api-next
area: dance
parent: api-dance-attempt-shadow
priority: normal
worktree:
branch: feat/dance-moderator-verdict
owner_role: api-next Dance attempt coordinator
coordination: exclusive
blocked_by: dance-moderator-verdict-amendment
updated: 2026-09-30
closed_at:
review_after: 2026-10-21

Implement the ratified owner-verdict amendment to Spec 021 (draft at `~/Documents/agents/handoffs/SPEC-021-MODERATOR-VERDICT-AMENDMENT-DRAFT-2026-09-30.md`) on
top of the private Dance session, consent, upload and cleanup machinery from
api-dance-attempt-shadow. The scope follows the ratified text, not the draft,
where they differ.

Expected shape from the settled decisions: a `moderator_verdict` grading mode
on the qualification-policy version, frozen per session; owner-only review,
excluding the dancer by account and rechecking authority at commit, and
refusing review submissions where the dancer is the community's owner; the
sampled-frame safety gate before a private attempt reaches the owner, with
flagged attempts held and never shown; short-lived signed access for the dancer
and owner only; the screening, awaiting_review, reviewed, review_expired, held
and withdrawn states with a seven-day window and terminal verdicts; a
dancer-only read of their latest attempt's state on the dance; submit-and-post
handing the same recording to the ordinary Post path as its own object, so
deleting the private attempt never affects the post; readiness of a new dance
from playable video plus verified alignment, without pose processing; and a pass
producing a qualification only through the ratified money route, limited to
community- or song-owner-funded rewards.

Regenerate and publish the client through the normal pull request flow. Gates
are the api-next check, postgres17 and secret-boundary suites. This task
authorizes no deployment and no reward change.
