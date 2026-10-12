# Product workflow orchestration: frontend machines and durable intents

> Adult publication/viewing clarification — ratified 2026-09-12: Adult content
> permitted by the community publishes when its other publication requirements
> pass. An adult signal alone does not block or hold that content. Accepted
> sexual or graphic-violence matches establish an `adult_18` floor independently
> of the community's permit/review/block decision. Owners and moderators cannot
> lower that floor or exempt a viewer. Spec 006 §6.1 owns the shared age ceremony
> and contextual return; Spec 013 §7 owns all Pirate viewing surfaces. Public
> IPFS audio and descriptive registration metadata remain governed by Spec 008.

> Activity authorization correction — ratified 2026-09-06: Spec 006 §3A owns
> the participation/posting boundary. Study, Karaoke and private Dance sessions
> are not membership-scoped effects. Their launch, replay, provider execution and
> finalization must use activity authority without community posting proofs.
> Reuse shared identity/resource checks without importing the posting membership
> predicate. Publication remains a separate transactionally checked effect.

> Cover-art general-audience amendment — ratified 2026-08-28: Embedded song
> artwork is a platform-wide general-audience surface regardless of the song's
> own `general | adult_18` rating. A valid pinned OpenAI image-moderation result
> with no matched image-supported category may expose the cover artifact. Any
> matched image category, provider failure, unavailable or invalid result
> withholds the cover while allowing an otherwise eligible song to publish.
> A withheld cover has no owner override or appeal in the MVP; the author may
> submit a different cover. The decision durably records account, submission,
> timestamp, provider and policy revisions, normalized reason, and restricted
> evidence reference so later repeat-abuse policy can use evidence without
> inventing automatic account punishment now. Apparent-age classification is
> retained only for future escalation: once a separately pinned adapter is
> ratified, `present` sexual context with `possible_minor` age blocks the whole
> submission and creates `platform_held`; every other uncertain combination
> withholds only the artwork. Until then, absence of that adapter never exposes
> a cover that OpenAI flagged and never blocks the song merely because the
> escalation classifier is unavailable.
>
> Community-follow amendment — ratified 2026-08-27: [Spec 016](016-community-follows-membership-home-feed.md)
> adds the follow effect to the join machine without changing eligibility:
> a successful active membership and its active follow commit atomically;
> a pending request preserves independent follow state; an active member
> cannot unfollow. There is no current leave, ban, approval, rejection, or
> membership-revocation command. The declared `JoinCommunity.status = left`
> branch is unreachable contract debt and must be removed by a versioned
> contract correction rather than treated as a hidden leave flow.
>
> **Owner-only moderation MVP amendment — ratified 2026-08-27:** Community
> owners are the only moderation actors in the MVP. Platform-held child-safety
> evidence remains private and retained but has no list, detail, action, appeal,
> or override route; no owner, global scope, caller marker, or platform operator
> can clear it. The deferred operator-authority design remains future trust-and-
> safety input and creates no current schema or runtime surface. Automatic
> publication of unflagged text requires the pinned OpenAI driver to be enabled;
> while it is disabled or unavailable every submission fails closed to owner
> review. The workspace owner waived the former OpenAI retention, DPA, and
> organization/project data-sharing production gate on 2026-08-27. Provider
> key provisioning, deliberate configuration enablement, deployment, and a
> bounded smoke test remain operational steps rather than privacy acceptance
> gates.

> **Community moderation and per-resource rating amendment — 2026-08-26:**
> Community creation atomically grants its creator the sole active owner role
> and creates the initial moderation-policy revision. Community policy maps
> thirteen provider-semantic categories to `permit | review | block` above a
> versioned platform floor. Published resources, not communities, carry
> `general | adult_18`; visibility and viewer age capability are independent
> read guards. This amendment supersedes this spec's deferred
> `allow_with_gate` statements, the 0.95 `sexual/minors` score threshold, the
> moving moderation-model default, global moderator-scope authorization, and
> the earlier exclusion of rejecting a held comment or reply.

> **Creation-route amendment — 2026-08-20:** Spec 012 supersedes the former
> `draft.slug`, `communities.route_slug`, separate-host, and single-ceremony
> creation contract. The server-owned draft now carries a namespace route request;
> `verification_required` is discriminated by typed `next_action.requirement`;
> namespace draft validity binds to the requested family/root rather than the
> whole editable draft, while its security envelope also binds the actor,
> intent, generation, and provider under spec 012; final commit atomically
> activates the community with one verified canonical route.

> **Posting-machine amendment — 2026-08-21:**
> [Spec 013](013-posting-state-machines.md) supersedes the mixed client/server
> song diagram formerly in §5 and the duplicated later-song outcome list
> formerly in §7. Spec 010 §4 remains the authority for text moderation and
> held-submission semantics; spec 013 maps those terms without redefining them.
> Section 6's CDR ownership and §8's six-layer test contract remain unchanged.

> **Namespace ceremony endpoint/lease amendment — 2026-08-21:** The
> `namespace_ownership` next action now dispatches only to spec 012's
> namespace-specific start and poll paths. Its exact request/response, HTTP
> mapping, three-consumed-attempt budget, and 16-second non-renewable
> provider-work lease are closed in spec 012 §3.1; generic Very session paths
> remain unrelated.

> **Text `CreatePost` contract amendment — 2026-08-21:** Order 4 reshapes the
> existing shared `CreatePost` operation rather than adding a parallel text
> endpoint. `publish_mode` is removed from the whole declared request union and
> text returns `TextContentSubmissionV1` with HTTP 201. Non-text variants remain
> runtime-rejected with `400 bad_request`; their eventual accepted responses
> remain owned by later typed-track charters. Unknown `publish_mode` input must
> continue to fail closed at both HTTP and direct application decode boundaries.
> An ineffective community route on an existing privileged content write maps
> through its already-declared `404 not_found`; membership failure remains the
> declared `403 membership_required`. Author-scoped submission lookup also uses
> redacted `404 not_found` for an absent or non-owned resource. No new route-
> effectiveness wire error is introduced by the route-revalidation lane.

> **Song/media R0 contract amendment — 2026-08-23:** Spec 013 §5 and §8 and
> the completed `posting-state-machines` ratification supersede the preceding
> amendment only where it retains non-text `CreatePost` variants for runtime
> rejection. R0 removes those shipped variants and the ratified reject-list
> common fields, records the breaking change, and republishes the generated
> client. Text moderation, `TextContentSubmissionV1`, HTTP 201, and strict
> rejection of excess input remain unchanged. Song uses its separate typed
> media-submission endpoints; it is not added back to `CreatePost`.

> **Order 6 comments/replies pre-dispatch amendment — 2026-08-22:** The
> comments/replies contract is recorded before its contract or runtime writer
> may open. The tranche adds these two top-level, session-authenticated,
> human/admin-only endpoints:
>
> ```ts
> type TextCommentReplyRequestV1 = {
>   idempotency_key: string;
>   body: string;
>   author_declared_rating?: "general" | "adult_18";
> };
>
> POST /posts/:postId/comments
> POST /comments/:commentId/replies
> ```
>
> Both requests use the same body shape and return `TextContentSubmissionV1`
> with `surface: "comment"` or `surface: "reply"`. `operation_id` remains an
> internal durable identity and is never part of the request, response, or
> generated client. Media, guest, anonymous, delegated-agent, authorship, and
> other legacy comment fields are outside this v1 shape and are rejected.
>
> The idempotency identity is `(actor_id, endpoint_template,
> idempotency_key)`, where the endpoint template is the route operation rather
> than a concrete target URL. The request hash includes the community, target
> post or parent, and canonical request body. Thus same-key/same-hash replays
> the original response, same-key/different-hash returns the typed 409
> `reason_code: "idempotency_conflict"` with `submission_id`, and reuse across
> communities conflicts for the same actor and endpoint. A committed replay
> is resolved before moderation and makes zero new moderation calls.
>
> Schema decoding is exact. The body is normalized to canonical NFC text and
> the moderation input is serialized with RFC 8785 JCS; `input_sha256` is the
> lowercase SHA-256 of those exact UTF-8 JCS bytes. The commit transaction
> rechecks actor membership, the effective route, current policy revision,
> target community/thread membership, idempotency identity/hash, and parent
> state. A reply checks `reply_depth_exceeded` before moderation; the parent
> must be published and replyable at commit, must share both community and
> thread root, and the maximum permitted depth is eight inclusive.
>
> Public submission states remain exactly `published`, `manual_review`, and
> `blocked`. Provider-unavailable, timeout, malformed, and age-gate signals
> map to `manual_review`; a policy block maps to `blocked`. Neither outcome
> creates a `Comment` row, public projection, counter increment, notification,
> or cache-invalidation outbox effect. `allow` and the approve path use the
> internal `manual_review -> processing(publish) -> published` sequence and
> commit the comment, `comment_publication_projection`, `posts.comment_count`
> or `comments.reply_count`, and the transactional
> `content_publication_outbox` atomically. Its closed `event_type` values are
> `comment_published`, `comment_notification`, and
> `comment_cache_invalidation`; each effect is deduplicated by
> `(submission_id, event_type)`.
>
> The 2026-08-26 moderation amendment supersedes this tranche's original
> no-block boundary: a held comment or reply may be rejected through the
> case-scoped action contract and advances to the existing public `blocked`
> submission state. Automatic held cases still cannot be dismissed into
> publication. Reports remain `POST /comments/:commentId/reports` with required
> `{ idempotency_key, reason_code }`, duplicate open reports coalesce, and
> moderator actions remain case-scoped at
> `POST /moderation/cases/:caseRef/actions`.
>
> Comment votes are not part of this migration or acceptance. The later vote
> tranche has its own reserved migration and action ledger. Its v1 cast and
> clear bodies contain only `idempotency_key` plus cast `value`; `VoteRequest`
> and the clear body contain no optional challenge field, and both auth
> declarations use `Auth.userOrAdmin()`. Cast/change/clear never
> invoke moderation, and clear returns `value: 0`.

> Route-optional creation amendment — 2026-08-23: Section 2's V2 creation
> machine has exactly one evidence requirement, `human_identity`, and zero
> `namespace_ownership` requirements. Commit creates the active community with
> no route and returns a generated `community_…` id plus permanent
> `/c/<community_id>` href under immutable authority version
> `optional_route_v2`. The immutable creation result records
> `canonical_route: null`; later attachment changes only the current community
> projection. Route attachment is the sibling post-commit aggregate in spec
> 012 §3.9 and requires `manage_routes` authority at intent creation and commit.
> `quota_exceeded` remains the creation abuse control. Every membership-scoped
> content effect in §4 uses
> `active_community_effect(community_id, user_id)`, which proves only active
> community status plus that actor's active membership. Posting, moderation,
> comment, and vote policy remains in each owning repository. Namespace-route
> resolution, optional hosts, and handle effects keep
> `effective_active_route`.

> **Handle-sales authority amendment — 2026-08-25:** Spec 012 §5.3 adds the
> account-scoped, delegable `manage_handle_sales` community authority. New
> community commit grants it to the creator beside `manage_routes` without
> adding a verification requirement, route, or response member. The api-next
> implementation backfills the same grant deterministically for every existing
> non-deleted community creator; it never infers a grantee from a route,
> persona, moderator, or delegated route authority.

Status: ratified specification checkpoint — 2026-08-20. Owner: workspace human
through the coordinator. Implementation remains gated on the identity/media
charters and the acceptance gates below. Covers the user-facing happy-path flows —
community creation, Very verification, joining, song submission, video
references, and processing projections — as cooperating state machines over
durable, resumable, server-owned intents. Claims are 006; media analysis is
007; DATA registration is 008; locked delivery is 011.

Amended 2026-08-20: text/comment moderation evidence boundary, safe public
reasons, reload-safe submission resource, comment/report/action/vote contracts,
the then-deferred age-gate/image-comment boundary, and the spec-012 community
route supersession. The 2026-08-26 amendment above closes that age-gate
boundary through per-resource rating.

## 1. Track and principles

- Owning lanes: the backend additions (durable intents, canonical decisions,
  typed next actions, projections) land inside the identity and media lane
  charters; the machines themselves are the Solid product-wiring tranche.
- The frontend is several cooperating machines, not one wizard. The server
  owns decisions; the client owns wording. No generic server-driven UI
  engine is built.
- Every machine is reload-safe in the appropriate sense: durable workflows
  reconstruct from the server; ephemeral browser work restarts from the last
  durable checkpoint. Browser back never repeats an effect, and leaving the
  page never abandons server-side work.

## 2. Community creation: two machines

Server-owned intent (durable, authoritative):

```text
draft -> verification_required -> commit_ready -> committed
      -> expired | cancelled
blocked: quota_exceeded | gate_unsupported   (non-retryable)
```

The durable status union includes both blocked outcomes; they are not an
ephemeral error overlay:

```ts
type CommunityCreationStatus =
  | "draft"
  | "verification_required"
  | "commit_ready"
  | "committed"
  | "quota_exceeded"
  | "gate_unsupported"
  | "expired"
  | "cancelled";
```

Client presentation (derived, never persisted as truth):

```text
loading | editing | saving | redirecting | completing | committing | error
```

The event/transition table is normative and owned by this spec:

| Event | Server transition | Rule |
| --- | --- | --- |
| create/update draft | `-> draft` | new revision; prior revisions immutable |
| preflight + existing human evidence satisfies its requirement hash | `draft -> commit_ready` | no repeated ceremony |
| preflight + human evidence unmet | `draft -> verification_required` | typed next action identifies `human_identity` |
| preflight + quota or capability failure | `draft -> quota_exceeded \| gate_unsupported` | blocked, non-retryable |
| provider return, human evidence valid | `verification_required -> commit_ready` | exact requirement and generation must match |
| commit | `commit_ready -> committed` | idempotent by client key |
| expiry / cancel | any nonterminal `-> expired \| cancelled` | server-clock deadlines |

Invariants:

- The draft is persisted before leaving for Very verification.
- Creator Very evidence binds to the account, the creation intent, and the
  creator's **verification-requirement hash** — not the whole draft revision
  or the community's member policy. Editing the description or changing an
  additional member requirement triggers re-preflight and a new canonical
  member-policy revision, but does not repeat creator verification unless the
  creator requirement or its provider binding changes.
  Per the 2026-09-03 (Spec 012) and 2026-09-19 (Spec 006) amendments, this
  invariant describes pre-boundary intents only. A new intent carries no
  creator requirement and binds no creator evidence.
- The OAuth return never creates a different policy than the reviewed one:
  commit consumes the exact canonical policy revision and hash.
- A V2 creation intent has exactly one `human_identity` requirement row and
  zero `namespace_ownership` rows. Namespace evidence belongs only to spec
  012 §3.9's sibling attachment aggregate.
- Commit is idempotent by client-supplied key. It atomically creates the active
  community, initial gate revision, creator's default `manage_routes` and `manage_handle_sales` grants,
  exactly one active `owner` assignment for the creator account, and the
  community's initial moderation-policy revision with no canonical binding.
  The immutable result carries authority
  version `optional_route_v2`, permanent `/c/<community_id>` href, and
  `canonical_route: null`; later attachment does not change exact replay.
- `quota_exceeded` is blocked and non-retryable — it routes to the operator
  approval path, never to silent retry.

Product flow (2026-09-19 document-only join policy amendment): details page
(optional community avatar, name, description) -> "Who can join?" page (one
mutually exclusive policy choice; see below) -> profile page (fresh Public name by
default, or a named unbound existing profile; optional profile avatar) ->
commit (reserve) -> `activate_profile` for a fresh owner (Spec 014 §3.1) ->
commit (publish) -> ready. No step verifies the creator. A community member
policy is exactly one of two kinds: the Palm policy (`human-verification`),
presented as the palm scan by the current product, or the document-nationality
policy (`nationality-allowed`, no `human-verification`). Open membership is
not offered, the Palm policy is the default, and the two policies are mutually
exclusive. The "Who can join?" page offers "Anyone with Palm verification" and
"People with selected nationalities"; the nationality option appears only when
the fetched authoring context allows it, and unsupported options are hidden in
production, not shown disabled. "Attach a route" is an optional later flow and
is never inserted into the creation path.

Community moderation authority is private account authority, not creator
provenance or persona presentation. `community_role_assignments` has the
closed future-facing role set `owner | admin | moderator`; this checkpoint
creates and resolves only `owner`. A partial unique index permits at most one
active owner per community, and a guard trigger refuses deletion or
deactivation of the sole active owner. Existing communities backfill the owner
from immutable `created_by_user_id`; after backfill that provenance column is
never consulted for authorization. There is no grant, revoke, transfer, team,
admin, or moderator-management API in this checkpoint.

## 3. Member join: two machines

Server-owned facts: eligibility evaluation, pending request records,
membership. Client presentation:
`loading -> verify -> completing -> recheck -> joining -> joined`.

- Verification completion never implies membership: the client always
  re-fetches eligibility after the provider return, then joins.
- Eligibility responses carry a typed next action, keeping claim algebra out
  of UI code. `provider_id` is a validated identifier from the server's
  registered provider set — the surface is provider-neutral and must not
  encode `"very.oauth"` as the only possibility:

```ts
type NextActionWaitReasonCode =
  | "verification_pending"
  | "membership_pending"
  | "operation_pending"
  | "reconciliation_pending";

type JoinNextAction =
  | { kind: "start_verification"; provider_id: string; intent_id: string }
  | { kind: "join" }
  | { kind: "request_membership" }
  | {
      kind: "wait";
      reason_code: NextActionWaitReasonCode;
      retry_after_seconds?: number;
    }
  | { kind: "blocked"; reason: "banned" | "gate_failed" | "unsupported" }
  | { kind: "none"; reason: "already_joined" };
```

  `reason_code` is the enumerated `NextActionWaitReasonCode` frozen in
  contracts — never free-form server prose, because the client owns wording.

- For the curated v1 human gate, the public summary is
  `human_verification`, not the internal two-claim algebra. Missing evidence
  returns `status: "verification_required"`,
  `missing_capabilities: ["human_verification"]`, and a server-issued opaque
  `start_verification` intent bound to the actor, community, current policy,
  requirement hash, and persisted provider binding. Pending/completed starts
  replay exactly; failed/expired ceremonies advance to a fresh intent
  generation. A pass returns `{ kind: "join" }`; verification completion alone
  never creates membership.

- Depends on the 006 contract repair (provider ids, capability vocabulary).

## 4. Text/community-content vertical (first implementation slice)

The first product slice is deliberately text-only and must be accepted before
the media foundation or song/video lane starts. It is the smallest vertical
that proves the identity gate and the content projection seam:

```text
editing -> submitting -> published
                    |- manual_review
                    `- blocked
```

The publication decision is a closed contract:

```ts
type TextPublicationDecision = "allow" | "manual_review" | "blocked";

type TextModerationSurface = "text_post" | "comment" | "reply";

type ContentRatingV1 = "general" | "adult_18";

type ModerationPolicyCategoryV1 =
  | "harassment"
  | "harassment/threatening"
  | "hate"
  | "hate/threatening"
  | "illicit"
  | "illicit/violent"
  | "self-harm"
  | "self-harm/intent"
  | "self-harm/instructions"
  | "sexual"
  | "sexual/minors"
  | "violence"
  | "violence/graphic";

type ModerationPolicyDecisionV1 = "permit" | "review" | "block";

type CommunityModerationCapabilityV1 =
  | "moderation.view"
  | "moderation.act";

type TextModerationInputV1 = {
  version: "text-moderation-input-v1";
  surface: TextModerationSurface;
  title: string | null;
  body: string | null;
};

type TextModerationReasonCode =
  | "sexual_minors"
  | "adult_sexual"
  | "graphic_violence"
  | "harassment"
  | "threat"
  | "hate"
  | "self_harm"
  | "illicit"
  | "spam"
  | "other_policy"
  | "age_gate_required"
  | "provider_unavailable"
  | "provider_timeout"
  | "provider_invalid";

type TextModerationEvaluationV1 = {
  version: "text-moderation-v1";
  surface: TextModerationSurface;
  decision: TextPublicationDecision;
  reason_codes: readonly TextModerationReasonCode[];
  policy_revision: string;
  policy_hash: string;
  input_sha256: string;
  evidence_ref: string | null;
};

type TextModerationEvaluationV2 = {
  version: "text-moderation-v2";
  surface: TextModerationSurface;
  decision: TextPublicationDecision;
  reason_codes: readonly TextModerationReasonCode[];
  policy_revision: string;
  policy_hash: string;
  platform_policy_revision: string;
  platform_policy_hash: string;
  community_policy_revision: string;
  community_policy_hash: string;
  matched_categories: readonly ModerationPolicyCategoryV1[];
  category_decisions: Readonly<
    Partial<Record<ModerationPolicyCategoryV1, ModerationPolicyDecisionV1>>
  >;
  effective_policy_decision: ModerationPolicyDecisionV1;
  author_declared_rating: ContentRatingV1;
  resulting_content_rating: ContentRatingV1;
  input_sha256: string;
  evidence_ref: string | null;
};

type TextModerationEvaluation =
  | TextModerationEvaluationV1
  | TextModerationEvaluationV2;

type ModerationCaseEvidenceV1 = {
  matched_categories: readonly ModerationPolicyCategoryV1[];
  category_decisions: Readonly<
    Partial<Record<ModerationPolicyCategoryV1, ModerationPolicyDecisionV1>>
  >;
  effective_decision: ModerationPolicyDecisionV1;
  resulting_content_rating: ContentRatingV1;
  author_declared_rating: ContentRatingV1;
  provider_scores: Readonly<Partial<Record<ModerationPolicyCategoryV1, number>>>;
  applied_input_types: Readonly<
    Partial<Record<ModerationPolicyCategoryV1, readonly ("text" | "image")[]>>
  >;
  policy_revision: string;
  policy_hash: string;
  platform_policy_revision: string;
  platform_policy_hash: string;
  community_policy_revision: string;
  community_policy_hash: string;
};

type PublicTextModerationReasonCode =
  | "policy_violation"
  | "review_required"
  | "moderation_unavailable";

type PublicTextPublicationResultV1 =
  | { decision: "allow"; reason_code: null }
  | {
      decision: "manual_review";
      reason_code: "review_required" | "moderation_unavailable";
    }
  | { decision: "blocked"; reason_code: "policy_violation" };

type PublishedTextResourceV1 =
  | {
      kind: "post";
      post_id: string;
      href: string;
      content_rating?: ContentRatingV1;
    }
  | {
      kind: "comment";
      comment_id: string;
      href: string;
      content_rating?: ContentRatingV1;
    };

type TextContentSubmissionV1 = {
  submission_id: string;
  href: string;
  surface: TextModerationSurface;
  status: "published" | "manual_review" | "blocked";
  result: PublicTextPublicationResultV1;
  published_resource: PublishedTextResourceV1 | null;
  review_ref: string | null;
  created_at: string;
  updated_at: string;
};
```

`TextModerationEvaluation` is the durable internal/audit union. V1 remains the
exact landed provider-policy shape; all post-amendment decisions write V2.
`PublicTextPublicationResultV1` is the complete moderation result embedded in
an ordinary-author creation response; published feed resources expose neither
moderation result. The mapping is
exhaustive: every internal `blocked` result becomes `policy_violation`; a
`manual_review` result containing any `provider_*` reason becomes
`moderation_unavailable`; every other `manual_review` result, including
`age_gate_required`, becomes `review_required`; and `allow` has no reason.
Internal category/reason codes, scores, thresholds, provider/model identity,
policy revision/hash, input hash, and `evidence_ref` are visible only to the
authorized owner-moderator surface. They never appear in ordinary API
errors, generated public clients, feed projections, logs returned to clients,
analytics events, or client telemetry.

`TextContentSubmissionV1` is the reload-safe ordinary-author resource returned
by text-post, comment, and reply creation and readable at
`GET /text-content-submissions/:submissionId`. Its cross-field invariants are
closed: `published` has an `allow` result, a non-null resource of the matching
surface, and null `review_ref`; `manual_review` has the matching result, null
published resource, and a non-null opaque `review_ref`; `blocked` has the
matching result and both references null. It never contains canonical content,
internal reason codes, hashes, scores, policy/provider metadata, or evidence
references.

`PublishedTextResourceV1.content_rating` is an optional dated compatibility
extension. Every new publication response includes it; exact replay of a
pre-amendment creation snapshot may omit it and must remain byte-identical.
Current canonical post/comment reads always use the rated projection in spec
013 rather than inferring `general` from an omitted historical snapshot field.

The GET is author-scoped and returns the current submission representation.
Authorized moderator action may advance a held submission from
`manual_review` to `published` or, where the owning tranche has explicitly
ratified a block action, `blocked`, and GET then returns that updated state.
Held comments and replies may also advance to `blocked` through the ratified
`reject` action in §4.1. Creation
replay is separate: same-key/same-hash POST replay always returns the immutable
original accepted creation snapshot, including its original `manual_review`
state. Moderator action never rewrites that snapshot.

The moderation projection normalizes CRLF/CR to LF, applies Unicode NFC, and
trims only leading/trailing whitespace in each nullable field. Its
`input_sha256` is lowercase hexadecimal SHA-256 over UTF-8 RFC 8785 JCS bytes
of the exact `TextModerationInputV1` object. No caption, link-preview,
enrichment, HTML expansion, or provider-created text is hidden in this v1
preimage. The OpenAI adapter may format that typed object for its API, but
checked-in fixtures bind the adapter request back to these exact fields.

`TextModerationInputV1` and its `text-moderation-input-v1` literal are frozen.
The dated rating amendment does not add `author_declared_rating` to that JCS
preimage and does not rewrite any existing `input_sha256`. The declaration is
separate creation-decision input: the endpoint's canonical request hash,
evaluation, case, and publication record bind it, while the provider input hash
continues to cover only the exact surface/title/body object above.

The landed text-post and `TextCommentReplyRequestV1` bodies gain
`author_declared_rating` only as an optional dated extension. Absence resolves
to `general` after the raw accepted request body is hashed, so a pre-amendment
same-key replay retains its original request hash and response. Explicit
`general` and `adult_18` are distinct new request hashes. Exact server decoders
must accept the optional field before a client begins sending it; no generated
client may make it required in this contract version.

Decision invariants are provider-independent. The platform floor is a
versioned complete table: `sexual/minors` is `block`;
`harassment/threatening`, `hate`, `hate/threatening`, `illicit/violent`,
`self-harm/intent`, and `self-harm/instructions` are at least `review`; the
remaining six categories are permit-eligible. A community revision contains
one `permit | review | block` value for every category and may equal or raise,
never weaken, that floor. Multiple matches resolve by
`block > review > permit`. Unknown provider categories and every
`provider_*` reason resolve to review. Every non-allow result has at least one
reason code. No score, provider label, or free-form explanation may be
interpreted by an ordinary client as a decision.

The initial immutable community revision is all thirteen categories at
`review` except `sexual/minors = block`. Policy changes create new immutable
prospective revisions. Existing publications and open cases retain the
platform and community revisions recorded at evaluation unless an explicit
re-moderation action creates new evidence. Accepted `sexual` and
`violence/graphic` matches produce `adult_18` even when the community decision
is review or block; other categories do not themselves raise that rating.
The `sexual/minors` platform block remains unconditional and is never made
publishable by an age gate. A permitted adult signal remains `allow`, not an
automatic hold or rejection. The publication rating is
`max(author_declared_rating, automated_rating)`. Rating never clamps a policy
decision downward and never changes ordinary visibility.

The 2026-09-12 rule supersedes the earlier permit-only rating calculation.
Implement it with a named successor rating-rule revision recorded and bound
to new evaluation evidence; do not silently change a frozen evaluation's
meaning or hash. Before enabling this flow, a forward reconciliation must
raise affected held and published resources when retained accepted evidence
contains an adult signal, preserve author/parent floors, cascade to dependent
projections, and invalidate affected caches. Missing or undecodable evidence
needed to establish a safe current rating requires a held/locked current read
until resolved, not an assumed general result. Retain original evaluations and
idempotent response bytes as history; replay must not lower the current read
floor or repeat publication effects. No owner/moderator action or policy edit
may clear a recorded adult signal on that resource revision.

All internal reasons mapping to the same public result use the same response
schema; an implementation must not leak category, score, threshold proximity,
or provider failure class through optional fields or error prose. Acceptance
fixtures enumerate every internal reason and mixed-reason set, assert the
public mapping above, and assert generated-client drift fails if a new public
reason is added without a dated contract amendment. Authenticated submission
rate limits and audit signals cover repeated near-duplicate probing; they must
not change a moderation decision into an allow result.

- A text post write requires
  `active_community_effect(community_id, user_id)` from spec 012 in the target
  community. V1
  text creation is session-authenticated human/admin only; delegated agents
  and guests are a later contract, and admin authentication does not bypass
  active membership. The application receives only the canonical actor and
  community ids, never a Very proof or provider-specific gate assertion. The
  same transaction rechecks the actor-bound active community and membership,
  validates the client-supplied idempotency key as server-owned durable state,
  and records
  the explicit publication decision; the client cannot submit `publish_mode`
  or otherwise declare a published result.
- A duplicate idempotency key with the same request hash replays the original
  result. Reuse with a different request hash is a typed conflict and creates
  no second post or projection row.
- The handler checks for a durable replay before calling the moderation port,
  calls the provider outside any database transaction, then rechecks
  `active_community_effect(community_id, user_id)`, idempotency key/request
  hash, and moderation-policy revision in the commit transaction. A concurrent
  duplicate may cause redundant provider evaluation but never a second post or
  public effect. If the policy revision
  changed during evaluation, the stale decision cannot commit and is retried
  against the new revision.
- Publication is an explicit server decision (`allow`, `manual_review`, or
  `blocked`), not an implicit consequence of a successful insert. Only an
  `allow` decision atomically writes the submission, an authoritative
  `Post.status = "published"`, and its `home_feed_projection` row.
  `manual_review` writes the submission, held canonical revision, and one open
  moderation case but no Post or feed row. `blocked` writes the replay/audit
  submission and no Post, community-review case, or feed row; the
  `sexual/minors` hard floor additionally creates its private unresolved
  `platform_held` evidence case without changing the author response. Thus
  `manual_review` and `blocked` are submission statuses, not new Post statuses;
  a text Post is never returned as legacy `processing`. Moderator approval of
  a held text-post submission creates the Post and projection exactly once and
  changes that same submission to `published`.
- Applicable moderation and provider failures are fail-closed: a policy
  violation is `blocked`; an unavailable, malformed, timed-out, or otherwise
  inconclusive provider result is `manual_review`. No failure may silently
  become `allow` or publish content. Text moderation is a synchronous,
  injected safety port and never enters the media Queue or Workflow.
- The platform baseline evaluates every non-empty canonical title/body in the
  text-post slice and every canonical comment/reply body in §4.1. A community
  policy may be stricter but cannot disable that baseline. The exact baseline,
  community revision, configured provider/model identifier, and
  normalization rules are immutable policy revisions whose hash is recorded
  with every decision. Clients receive only the normalized decision/reason
  contract, not provider labels or prose.
- The moderation port is provider-neutral. The frozen legacy API is mixed
  evidence, not a contract to copy: its current OpenAI input is image-only;
  an earlier revision submitted post titles, bodies, and captions, but that
  behavior was removed; the persisted link-preview toggle has no verified
  input path. The target deliberately owns text moderation instead of
  claiming parity with those stale settings. Legacy decision precedence
  (`allow | allow_with_gate | review | disallow`) and its score threshold
  remain fixture evidence only. OpenAI Moderations is the first v1 driver
  behind the port; its exact snapshot is frozen in §4.0.1. A missing or
  exhausted driver has no allow fallback.
- The former `allow_with_gate` deferral is closed. The moderation decision
  remains `allow | manual_review | blocked`; an allowed resource separately
  carries `content_rating: general | adult_18`. Every Pirate-owned read applies
  ordinary visibility and the account capability from spec 006 §2.1. The wire
  enums must not be silently extended into a fourth publication decision.
- Text processing invokes no media provider and no media Cloudflare Workflow.
  It does not reserve an upload, create a media operation, or enter the media
  queue. “No media operation” does not remove the common posting operation:
  every text submission still owns spec 013's internal `operation_id`, which
  is not part of `TextContentSubmissionV1`. The text path may use only the
  content transaction and its own projection machinery.
- The first milestone covers text-post auth, idempotency/replay conflict,
  the closed publication decision, and atomic published feed projection. A
  separate follow-up slice adds comment/reply and vote writes before media
  work. Comments and replies use the contract below; votes have no text or
  media payload and must not invoke a moderation provider.

### 4.0.1 OpenAI moderation driver and visual-safety policy — 2026-08-26

The first target-owned driver pins `omni-moderation-2024-09-26`.
`OPENAI_MODERATION_MODEL` is validated and must equal that snapshot for the
initial policy revision. `omni-moderation-latest` is a moving alias reserved
for a later evaluated policy revision; it is not a fallback. The base URL
defaults to `https://api.openai.com/v1`, timeout defaults to 10,000 ms, and the
adapter makes one request with no retry in the request path. The retired
`OPENAI_MODERATION_SEXUAL_MINORS_BLOCK_THRESHOLD` has no target equivalent.

The request is exactly `{ model, input }`. Post title and body are separate
ordered text inputs; song title and optional accepted lyrics are separate
ordered text inputs; a comment or reply body is one text input; uploaded
images and embedded song artwork are image inputs. The adapter does not add a
prompt, concatenate fields, or send audio.

Video is moderated as an image post. Spec 007's `extractVideoFrames`
capability extracts at most three frames from the sealed bytes under
`VideoPosterPolicyV1` (the poster timestamp, the first frame, and the
midpoint); those frames are the ordered image inputs and the caption is the
one text input of a single request, bound to the video's `video_revision`,
canonical hash, `analysis_revision`, and the exact frame hashes sent. The
adapter does not send audio, the sealed video, or any playback encoding. A
client-uploaded poster is never a moderation input: the author may choose a
timestamp, but the server extracts the frame. The `sexual/minors` hard floor
and its private unresolved hold apply to each image input as they do for
image posts. Where this spec requires a separate visual minor-safety provider
and a deployment gate before image inputs are accepted in production, video
inherits that gate unchanged, except as the Spec 013 v1 automatic video
publication amendment (2026-09-25) provides: under the owner-enabled
`sampled_frame_openai_v1` gate, video allow rests on persisted per-frame
OpenAI results for the three sampled frames plus the caption result, recorded
as sampled-frame moderation evidence with a null minor-safety evidence
reference. That gate is an owner-accepted v1 risk, not a visual minor-safety
check. As implemented, each frame is a separately claimed and persisted
request (so one frame's result replays without resending the others) rather
than one combined request; the frame set, hashes and bindings above are
unchanged.

The adapter requires a non-empty result array and interprets the provider's
Boolean category flags one-to-one as `ModerationPolicyCategoryV1`. Decisions
use flags, not custom score thresholds. It retains normalized scores and
`category_applied_input_types` per input only in restricted evidence, together
with requested and returned model, both policy revisions, input hashes, and an
evidence hash. Ordinary logs and telemetry carry identifiers and outcome only;
raw submitted content and raw provider payloads are absent. Unknown category
keys fail closed to review and are logged for an explicit closed-set
amendment.

OpenAI image moderation does not supply every text category, including a
usable `sexual/minors` image signal. Embedded song covers are nevertheless
eligible for display under the general-audience cover amendment above when a
valid pinned OpenAI image result has no matched image-supported category. Any
match or provider failure withholds the cover and does not by itself block the
song. Other uploaded-image products remain disabled until they run a locked
platform visual-safety check before publication. The visual adapter's accepted
output is only:

```ts
type VisualMinorSafetyV1 = {
  sexual_context: "none" | "possible" | "present";
  apparent_age: "adult" | "uncertain" | "possible_minor";
};
```

For embedded song covers, `present` sexual context combined with
`possible_minor` apparent age creates `platform_held` and blocks the whole
submission once that separately pinned adapter is ratified. Every other
uncertain combination, and visual-check timeout, unavailability, refusal, or
invalid output, withholds only the cover. For other uploaded-image products,
`possible | present` sexual context combined with `uncertain | possible_minor`
apparent age creates `platform_held`; visual-check timeout, unavailability, or
invalid output also holds. A community owner cannot clear that state.
`sexual/minors` text flags block publication immediately and also create a
private `platform_held` evidence case. The owner-only MVP has no list, detail,
action, appeal, override, or automatic retry path that clears an existing
platform hold. A later fresh submission is evaluated independently.

Timeout, transport failure, non-success status, response-size overflow,
malformed JSON/schema, or empty results become a provider reason and therefore
`manual_review`; there is no retry or allow fallback in the synchronous
request. The former OpenAI retention/DPA and organization data-control gate is
waived by the 2026-08-27 owner amendment above. A separately accepted visual
provider and its data-handling gate remain required for minor-safety escalation
and for uploaded-image products other than embedded song covers; they do not
block display of a cover that passes the pinned OpenAI image check.

When `OPENAI_MODERATION_ENABLED` is false or the required driver configuration
is absent, the injected text-moderation port is unavailable and every text
submission fails closed to `manual_review`. Unflagged text publishes
automatically only after configuration
is provisioned, and the pinned driver is deliberately enabled. This deployment
gate does not change the owner-only authority model.

### 4.0.2 Policy-revision storage compatibility — 2026-08-26

The landed `text_moderation_policy_revisions` table and
`text_moderation_policy_current` singleton remain the authority for the
provider/normalization/adapter decision policy. Their existing
`policy_revision_id` and `policy_hash` columns map to
`TextModerationEvaluationV1.policy_revision` and `.policy_hash`; neither column
is renamed, repurposed as a floor, or rewritten.

The migration appends a new provider-policy revision for the pinned
`omni-moderation-2024-09-26` snapshot, Boolean-category mapper, normalization,
and timeout, then advances `text_moderation_policy_current` at the cutover
fence. Prior moving-alias/threshold revisions remain immutable and readable for
V1 evaluations; retiring the threshold means no new evaluation selects them,
not that their historical rows are edited.

The amendment adds two independent immutable revision families:

- `moderation_platform_floor_revisions`, with a current pointer and a complete
  thirteen-category floor plus its canonical hash;
- `community_moderation_policy_revisions`, keyed by community and revision,
  with all thirteen community choices plus its canonical hash.

New V2 evaluations store foreign-key-and-hash pairs for all three revisions:
provider policy, platform floor, and community policy. The evaluation and case
columns are `platform_policy_revision_id`, `platform_policy_hash`,
`community_policy_revision_id`, and `community_policy_hash` in addition to the
landed pair. A decision commit verifies every referenced row and byte hash.

Existing evaluation rows retain their landed pair and exact input hash. The
four new columns are nullable only for those pre-amendment rows, which read as
legacy evaluations with their already-stored decision and public result; they
are not assigned a guessed community policy and are not re-moderated by the
migration. After the cutover fence, insert/update guards require all three
pairs for every new evaluation. Backfilling each community's initial policy is
prospective and does not alter existing publication or action history.

### 4.1 Comment/reply moderation and review contract

The target intentionally improves on the legacy boundary. At the reviewed
legacy HEAD, text-only comments made no provider call and published
immediately; only comment image/GIF media was synchronously moderated. User
reports then opened a case and a moderator could hide, remove, or restore the
already-published comment. That behavior is evidence, not the v1 target.

The closed target types are:

```ts
type CommentPublicationDecision = TextPublicationDecision;

type CommentReportReasonCode =
  | "spam"
  | "harassment"
  | "hate"
  | "sexual_content"
  | "graphic_content"
  | "misleading"
  | "other";

type TextModerationActionV1 =
  | "approve"
  | "dismiss"
  | "hide"
  | "remove"
  | "restore";

type TextModerationTargetStatusV1 =
  | "held"
  | "published"
  | "hidden"
  | "removed";

type TextModerationActionV2 =
  | "approve_as_general"
  | "approve_as_adult_18"
  | "reject"
  | "dismiss_report"
  | "hide"
  | "raise_rating_to_adult_18"
  | "restore";

type TextModerationTargetStatusV2 =
  | "held"
  | "published"
  | "hidden"
  | "blocked";

type ModerateTextCaseV2 = {
  version: "moderation-case-action-v2";
  idempotency_key: string;
  expected_case_revision: number;
  action: TextModerationActionV2;
};

type ModerateTextCaseResultV2 = {
  version: "moderation-case-action-result-v2";
  action_id: string;
  case_ref: string;
  action: TextModerationActionV2;
  target_status: TextModerationTargetStatusV2;
};
```

V1 is a frozen shipped contract; V2 is its intentional breaking replacement,
not a set of aliases. New `approve`, `dismiss`, and `remove` commands are
rejected after V2 cutover. Exact same-key/same-hash replay of an already
committed V1 action is resolved from the idempotency ledger before V2 body
decoding and returns its original V1 bytes. A fresh unversioned V1 body fails
with non-retryable 409 `conflict`,
`details.reason_code: "contract_version_unsupported"`, and performs no effect.

The forward migration maps only each target's current `removed` state to
`hidden` and records an audited `legacy_removed_normalized_to_hidden` system
action. Immutable V1 action rows and responses keep their original `remove`
and `removed` literals; already-approved and dismissed outcomes are not
rewritten. The V2 query/projection never emits `removed`. Deployment order is
server dual-read/V1-replay plus V2 write support, current-state migration,
generated-client breaking release, then rejection of fresh V1 commands.

`reject` is legal only for held content and produces the existing public
`blocked` submission state with both resource references null. It imports spec
013's existing `moderator_blocked` transition without adding a fourth public
submission status.

Rules:

- Creating a top-level text comment uses
  `POST /posts/:postId/comments`; creating a reply uses
  `POST /comments/:commentId/replies`. Both are session-authenticated
  human/admin-only v1 writes, require
  `active_community_effect(community_id, user_id)`, and require a
  client-supplied idempotency key persisted as server-owned durable state.
  Same-key/same-hash replay returns the original
  result; same-key/different-hash is a typed conflict. Comment media is not in
  this slice and is rejected until the deferred image track is ratified.
- Top-level comments have `depth = 0`. A reply has `parent.depth + 1`; v1
  permits depth through 8 inclusive and rejects a deeper reply with the typed
  `reply_depth_exceeded` error before moderation. Every parent must belong to
  the same community and thread root and remain published/replyable at commit.
- Before any public comment write, the synchronous provider-neutral text port
  evaluates canonical comment text with `surface: "comment" | "reply"` and
  the effective community moderation-policy revision and hash. No database
  transaction spans the provider call. Missing configuration, timeout,
  malformed output, transport failure, or an inconclusive result maps to
  `manual_review`; it never publishes.
- As with text posts, an existing durable replay is checked before the provider
  call and the idempotency/request hash,
  `active_community_effect(community_id, user_id)`, target thread/reply state,
  and policy revision are
  rechecked in the commit transaction. A stale policy
  result or closed/removed parent cannot commit.
- `allow` atomically writes the authoritative published comment, ancestry,
  thread counters, public projection, and transactional outbox rows for
  notifications/cache invalidation. `manual_review` atomically writes a
  held submission revision, normalized evidence, and one open moderation case,
  with no Comment row, public projection, counter increment, notification, or
  cache publication. `blocked` records the replay/audit submission but creates
  no Comment row, held revision, case, or derived public effect.
- `approve_as_general` or `approve_as_adult_18` publishes a held comment and
  creates all public derived effects exactly once. General approval is invalid
  when the author, accepted automated signal, or inherited parent requires
  `adult_18`; neither approval is legal for a platform
  hold. `dismiss_report` resolves a report without changing visibility. `hide`
  makes an already-published comment non-public;
  `raise_rating_to_adult_18` performs the bounded descendant cascade owned by
  spec 013, and `restore` republishes a hidden target. Each action, case transition, comment
  status, projection/counter repair intent, actor, and evidence reference
  commits atomically and is replay-safe.
- A member report uses the closed reason enum above. One reporter/target pair
  is idempotent, and reports for the same target coalesce into one open case.
  A report alone never silently hides content. The queue exposes normalized
  evidence and audit references, not provider prose as client wording.
- A comment's effective `content_rating` is at least its parent's. A permitted
  adult signal or `approve_as_adult_18` stores the adult rating and publishes
  through the per-resource read guard; it is not another publication decision.
- Replies use the same rules as top-level comments. Votes are membership-
  authorized, replay-safe numeric actions and explicitly bypass this text
  moderation port.

Minimum report/action wire contracts are also frozen for this slice:

- `POST /comments/:commentId/reports` accepts required
  `{ idempotency_key, reason_code }` and returns opaque
  `{ report_id, case_ref, status: "open" | "coalesced" }`; same reporter,
  target, and key/hash replay, while key reuse with another reason conflicts.
- `POST /moderation/cases/:caseRef/actions` first resolves the case's community
  and requires `moderation.act` for an active owner assignment. Platform-held
  cases have no action route in the owner-only MVP and are returned as redacted
  not-found by this endpoint. It accepts required
  `ModerateTextCaseV2` and returns `ModerateTextCaseResultV2`. Invalid
  action/state pairs are
  typed conflicts, and replays never duplicate projection/counter/outbox work.
- The action matrix is closed: both approvals and `reject` apply only to
  `held`; `dismiss_report` resolves a report without changing its target;
  `hide` and `raise_rating_to_adult_18` apply only to `published`; and
  `restore` applies only to `hidden`. Automatic held-content cases cannot be
  dismissed into publication. Every action is fenced by the current case
  revision and same-key/same-hash replay is byte-identical.
- When a case's current or provisional rating is `adult_18`, an owner without
  the verified account capability may take only exposure-reducing actions:
  `hide` or `reject`. `approve_as_adult_18`, `dismiss_report`, and `restore`
  require the acting owner's own current `adult_18` capability because they
  publish, retain, or restore content the owner otherwise cannot inspect.
  `approve_as_general` is invalid for an adult-rated case even for a verified
  adult owner. Raising a currently visible
  general resource to `adult_18` remains allowed because it only narrows
  exposure. Every action audit row records the resolved age-capability class;
  there is no unrecorded blind-action bypass.
- Ordinary reporters/authors never receive other reporters, provider prose,
  internal evidence, moderator identity, or case notes through these shapes.

### 4.2 Vote action contract

V1 votes target posts only; comment votes are deferred. Cast and clear retain
the existing route split but require explicit idempotency:

```ts
type CastPostVoteV1 = { idempotency_key: string; value: -1 | 1 };
type ClearPostVoteV1 = { idempotency_key: string };
type PostVoteResultV1 = { post_id: string; value: -1 | 0 | 1 };
```

Cast uses `POST /posts/:postId/vote` and returns `-1 | 1`; clear uses
`POST /posts/:postId/clear_vote` and returns `0`. Both are session-authenticated
human/admin-only writes, require
`active_community_effect(community_id, user_id)`, and contain no delegated-agent
fields in v1. The server rechecks that predicate and
persists actor, target, idempotency key, canonical request hash, and result in a
vote-action ledger in the same transaction as the unique actor/post vote row
and aggregate repair.
Same key/hash replays the original result; same key/different hash conflicts.
Changing a vote or clearing it is atomic, reports no moderation result, and
never invokes the text/media moderation ports, Queue, or Workflow.

Post-vote implementation note — 2026-08-22. The shared content use-case body
decoder now rejects excess properties, so exact decoding applies across text
posts, comments, replies, reports, moderation actions, and post votes rather
than only the vote routes. This intentionally makes forged or retired fields a
`bad_request` before authority or persistence work.

The current transactional authority recheck locks the community row before
the target post. That preserves correctness but serializes otherwise unrelated
vote and comment writes within one community. Narrowing that lock is a later
throughput concern and must retain the effective-route and membership recheck;
it is not an acceptance blocker for migration 0040.

Acceptance adds pure decision/action transitions; provider/config failure
fixtures; real-Postgres duplicate-submit, approve, report-coalescing, and
projection/counter races; maximum-depth and cross-thread rejection; vote
cast/change/clear replay races; Workerd authorization and fail-closed tests; a
negative vote-does-not-moderate test; and Storybook/Playwright states for
submitting, held-for-review, blocked, published, hidden, and restored. V1
compatibility fixtures separately prove exact old-action replay, rejection of
fresh unversioned commands after cutover, preservation of immutable
`remove`/`removed` history, and the audited current-state migration from
`removed` to `hidden`. No media Workflow participates.

Required acceptance for this milestone is pure transition/invariant coverage,
Effect Schema and generated-client fixtures, real-Postgres race/replay tests,
the Workerd HTTP path, offline Storybook states, and Playwright through the
real Solid Worker and `/api` proxy. All are implementation gates, not work
authorized by this specification checkpoint.

## 5. Song submission machine and projections

[Spec 013](013-posting-state-machines.md) is the sole authority for the shared
creation machine, its song overlay, durable identities and revisions, typed
transition rejections, server snapshots, transport recovery, and the Solid
projection. It separates durable server phases from browser-only upload and
presentation states, models a missing required reference as nonterminal
`action_required`, and closes the creation outcomes as `published`,
`manual_review`, `blocked`, `processing_failed`, and `abandoned`. `done` is not
a domain state or phase.

Spec 007 continues to own media-provider inputs and decision policy. Specs 008
and 011 continue to own DATA registration facts and CDR/locked-delivery
machines. Post-publication enrichments remain independent projections rather
than a synthetic progress percentage. Video and other media tracks may use the
common machine only after a typed-track contract freezes their inputs,
analysis bundle, and decision fence.

## 6. CDR playback (summary; machines owned by 011)

Preparation (durable, server) and playback (browser) are separate machines
in 011. Playback runs `resolving_access -> wallet/entitlement action ->
requesting_read -> collecting_partials -> decrypting -> ready`; the browser
collection and decryption states are not durable — reload restarts safely
from `resolving_access`. Typed recoveries distinguish wallet rejection,
wrong chain, RPC disagreement, DKG timeout, corrupt ciphertext, and digest
mismatch. The post-v1 license-token recovery is deliberately absent from this
v1 summary.

## 7. Backend contract additions

Community moderation uses one resolver:
`hasCommunityCapability(account_id, community_id, capability)`. Both
`moderation.view` and `moderation.act` resolve from the active owner assignment
in this checkpoint. Every list, detail, and action first resolves the target
case to its community, rechecks that authority in the application and SQL
guard, and returns redacted not-found for unauthorized access. Public creator
identity, persona presentation, active membership alone, global moderator
scope, and caller-supplied operator markers grant no authority. The text and
media action guards use the same rule.

The minimum owner surface is:

```text
GET  /communities/:communityId/me/capabilities
GET  /communities/:communityId/moderation/cases?view=open|hidden
GET  /communities/:communityId/moderation/policy
PUT  /communities/:communityId/moderation/policy
POST /moderation/cases/:caseRef/actions
POST /comments/:commentId/reports
POST /posts/:postId/reports
GET  /me/age-capability
POST /me/minimum-age-attestation
```

The case list has exactly `open | hidden` views so Restore is reachable without
a history product. Detail exposes a bounded content preview only when the
owner's viewer age capability covers the case's resulting rating; otherwise it
uses the same locked placeholder and still exposes the policy evidence. Its
`permitted_actions` is capability-filtered by the rule below rather than merely
state-filtered. Detail also exposes author persona,
target type, `automatic | member_report | mixed` source, age, case revision,
and `ModerationCaseEvidenceV1`. Policy GET returns all thirteen rows, their
input types, community setting, effective floor, locked state, and whether
permit yields `adult_18`. PUT requires the current policy revision and a
complete thirteen-row replacement, then creates an immutable revision. It can
never weaken a floor.

`GET /communities/:communityId/me/capabilities` returns the private resolved
role and closed capabilities for the session account. Solid uses this
projection only to render controls; writes always recheck authority. The owner
dashboard route is `/c/:community/mod`, with Open, Hidden, and Policy views and
an informational sole-moderator state. It has no team-management surface.

Platform-held cases are private retained evidence with no resolver in the
owner-only MVP. They are excluded from owner queues and detail, and the owner
action route returns redacted not-found. No operator moderation endpoint,
principal registry, grant table, bootstrap ceremony, appeal, or override is in
this checkpoint. A future trust-and-safety amendment may add a separately
ratified resolver without rewriting retained platform-hold evidence.

Owner action audit rows retain the private acting account, presenting persona,
resolved owner-authority snapshot, before/after case state and rating, both
policy revisions, evidence reference, idempotency identity, and timestamp.
Moderator history projects only the presenting persona. Platform-held evidence
has no acting moderator or action history because no action is representable.

`GET /me/age-capability` returns `general` when no current verified minimum-age
evidence exists and `adult_18` with the accepted policy/provider reference when
it does, plus a provider-neutral verification next action. It never projects
the capability onto a public persona. The attestation command is owned by spec
006 §2.1.

- A `post_type: "text"` create request returns
  `TextContentSubmissionV1` with HTTP 201 for all three accepted moderation
  decisions; policy blocking is an accepted, persisted submission outcome,
  not a transport error. Top-level comment and reply creation use the same
  response and status. Their published resource is fetched through its
  canonical link. Order 4 applies this through the existing shared
  `CreatePost` operation. The 2026-08-23 song/media R0 amendment removes the
  formerly declared non-text variants; accepted media responses remain outside
  this text operation and use later typed-track contracts.
- Revisioned community-creation intent resource: create, read/resume,
  update, and commit; the client authoring draft is never authoritative.
  The minimum wire shape is frozen so implementing agents cannot invent
  incompatible contracts:

```ts
type CommunityCreationDraftV2 = {
  persona_id: PersonaIdV1;
  name: string;
  description: string | null;
  policy: CompiledGatePolicy;
};

type CommittedCommunityResourceV2 = {
  authority_version: "optional_route_v2";
  community_id: string;
  /** Permanent /c/<community_id>; never rewritten after route attachment. */
  href: string;
  canonical_route: null;
};

type CurrentCommunityResourceV2 = {
  authority_version: "optional_route_v2";
  community_id: string;
  href: string;
  canonical_route: CommunityCanonicalRouteV1 | null;
};

type CommunityCreationIntentV2 = {
  creation_contract_version: "optional_route_v2";
  intent_id: string;
  revision: number;
  status: CommunityCreationStatus;
  /** Server-owned canonical draft returned on create, read/resume, and update. */
  draft: CommunityCreationDraftV2;
  canonical_policy_revision: number;
  canonical_policy_hash: string;
  requirements: {
    human_identity: CreationRequirementProgressV1<"human_identity">;
  };
  next_action: CommunityCreationNextActionV2;
  expires_at: string;
  committed_resource: CommittedCommunityResourceV2 | null;
};
```

`persona_id` selects the public persona that presents the private creator
account's owner role. It is not an authorization identifier and adds no
community audience or age field.

The existing route-v1 draft, intent, and committed-resource types remain
exported for immutable history. The V2 endpoint projection is discriminated by
`authority_version: "optional_route_v2"`; it never adds a route request or
namespace requirement to creation. Atomic commit persists the display fields,
gate revision, creator `manage_routes` and `manage_handle_sales` grants, and generated `community_…`
identity with no canonical binding. Spec 012 §§1, 3, and 5 own the complete
creation authority.

`draft` is the resumable, server-owned authoring snapshot; the browser may
cache it for presentation but never becomes its authority. A committed
response always includes `committed_resource.community_id`, the permanent
`/c/<community_id>` href, and `canonical_route: null`; all non-committed
responses return `committed_resource: null`. Exact creation replay returns
that immutable snapshot after attachment. Current reads use
`CurrentCommunityResourceV2` and may expose the attached route.

```ts
type CommunityCreationNextActionV2 =
  | {
      kind: "start_verification";
      requirement: "human_identity";
      provider_id: string;
      creation_intent_id: string;
      ceremony_intent_id: string;
      generation: number;
    }
  | { kind: "commit" }
  | {
      kind: "wait";
      requirement: "human_identity" | null;
      reason_code: NextActionWaitReasonCode;
      retry_after_seconds?: number;
    }
  | { kind: "blocked"; reason: "quota_exceeded" | "gate_unsupported" }
  | { kind: "none"; reason: "committed" | "expired" | "cancelled" };
```

Namespace ownership never appears in a V2 creation next action. After commit,
an authorized user may enter the separate "Attach a route" flow from the
current community resource. That client follows spec 012 §3.9's sibling intent
and typed namespace ceremony and never submits provider, configuration, route-
evidence, or community-creation authority. Atomic commit also writes the sole
owner assignment and initial moderation-policy revision described in §2; the
committed wire resource gains no field for either. The route-attachment replay,
transport-failure, and database-time lease rules are owned by spec 012.

- Intent updates carry `expected_revision`; stale revisions are rejected.
- Intent creation and commit are both idempotent (client idempotency keys).
- Server-canonical policy preview and hash at each revision.
- Typed `next_action` on creation and eligibility responses.
- Posting snapshots and readable song-processing projections conform to spec
  013; every enabled media track also requires its own typed-track contract.
- Typed asset-access response: `public | authenticated_proxy | cdr_delivery`.
- Stable error codes with retry guidance; the frontend owns wording.

Spec 013 freezes the shared creation states and transitions, the separated song
author/analysis/publication bundles, the responsibility-based provider
exhaustion mapping, and the server/client projections. A later typed-track
contract may narrow enabled fields and must freeze the exact `song_reference`
and upload request shapes, but it must not add a parallel creation-state
vocabulary. DATA and CDR mappings remain owned by specs 008 and 011.

## 8. Test contract

These are the shared six layers cited by spec 013. Spec 013 adds posting-machine
fixtures and scenario traces within them; it does not define a parallel test
contract. All six are required before the product-wiring tranche is accepted:

1. Pure transition-table and invariant tests for every machine.
2. Effect Schema encode/decode fixtures and generated-client drift checks.
3. Workerd and real-Postgres tests for replay, expiry, quota races, stale
   revisions, duplicate commits, V2's one-human/zero-namespace cardinality,
   creator `manage_routes` and `manage_handle_sales` authorities, deterministic
   existing-community sales-authority backfill, and sibling route attachment.
4. Offline Storybook state catalog: every stable state, interaction plays,
   axe, mobile, RTL, reduced motion, visual snapshots, zero external
   requests.
5. Playwright E2E through the actual Solid Worker and `/api` proxy: OAuth
   redirect and return, reload, back/forward, lost network, duplicate
   callback, duplicate commit, route-independent post/comment/vote against the
   namespaceless Very fixture, and session-cookie writes with exact Origin/CSRF
   headers through the shared request-options helper.
6. Staging ceremonies: the real Very palm flow; the HNS cross-host/session
   flow; the real CDR locked-song ceremony per spec 011.

Moderation acceptance additionally enumerates all thirteen category flags,
every floor/community decision pair, mixed-category precedence, unknown keys,
provider failure, general/adult author declarations, and both adult-rating
categories. Fixtures pin the requested OpenAI snapshot and per-input applied
types and prove raw content, raw provider payload, scores, and internal reasons
never reach ordinary responses or logs. Golden fixtures prove the V1 moderation
input bytes/hash are unchanged when the separate author declaration varies,
old evaluation rows still decode as V1, new rows require all three verified
revision/hash pairs as V2, and no migration guesses revisions for history.

Authorization tests exercise owner, foreign owner, active member, global
moderator scope, and forged operator markers at HTTP, application, and real-
Postgres boundaries for text and media. Only an active owner assignment grants
moderation authority; the accepted `0043` media action guard is rewritten to
the same owner-only predicate with no stored-operator branch. Creation-race
tests prove exactly one owner and one initial policy revision. Case-action tests
cover stale revision, idempotent replay, every state/action pair, held-comment
rejection, the hidden Restore path, owner inability to list, inspect, or act on
`platform_held`, and, for the current owner-only MVP milestone, absence of every
`/operator/moderation` route. The missing false-positive review process is an
interim limitation, not a permanent prohibition on a future separately
authorized review process. Every
uploaded image fixture runs both image moderation and the visual minor-safety
port; unavailability and uncertain/possible-minor combinations cannot publish
or acquire a resolver.
Compatibility fixtures cover exact V1 action replay before V2 decoding, fresh
V1 rejection, the audited `removed -> hidden` state migration, the generated-
client breaking release, and age-capability filtering of adult-case actions.

Local fake OAuth and CDR providers exist only in test composition and are
structurally impossible to enable in production.
