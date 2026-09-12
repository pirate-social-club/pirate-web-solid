Creation decode evidence, 2026-09-11

The authorized real E2E run at 22:54:25 +0400 passed Privy sign-in and issued
POST /api/community-creation-intents. The API returned HTTP 400 with message
Invalid body request and retryable false. The paired request and response are
retained in song-onboarding-creation-decode-2026-09-11-network.json. Free text,
identity values, credentials, headers and cookies are not retained. String
length, trimmed length, control-character status, field names, types and
selected literal values remain available for diagnosis.

The sent draft has persona.kind create_new, public_name of length 17, name of
length 31, description of length 37 and policy version 1 with one and access
path requiring human-verification. No persona_id field is present. The response
provides a body-decode message but no field-level validation path.

The source comparison contradicts the claim that 480f0e64 has this exact
schema. At 480f0e64e7795fdbf772c76f4b103e20f7bcb2ea,
CommunityCreationDraftV2 requires persona_id: PersonaIdV1. At the pinned merged
API commit 4b9e84e6 it requires persona: PersonaCommunityChoiceV1 and permits
public_name. The exported name remained V2 while the shape changed. Exact
Git-derived declarations and full source SHA-256 digests are retained in
song-onboarding-creation-contracts-2026-09-11.json.

The browser's request is incompatible with that recorded old API schema.
This run does not independently read provider deployment metadata or establish
which precise worker served the response. That distinction remains necessary:
the source mismatch is proved; its attribution to the current deployment still
relies on the recorded 480f0e64 deployment receipt. No production source change,
compatibility fallback, deployment, reset or media-provider call was made.

The previous missing POST response was also a test problem. The helper stopped
on a visible alert without waiting for the creation request, and the observer
recorded completed responses only. The helper now awaits the creation response;
the observer records request starts with identifiers and drains pending body
reads before writing the failure attachment. The final run reports HTTP 400
at the creation step instead of treating an unrelated alert as its proof.

One intervening run failed before email entry; a fresh anonymous inspection
confirmed the expected login controls, and the subsequent run above passed
authentication. No conclusion about the provider was drawn from that transient
failure. No community or song was successfully created. Song acceptance remains
incomplete. The next gate is an aligned, prepared API/Solid test target, with
its serving revisions verified, running this same unmapped request contract.
