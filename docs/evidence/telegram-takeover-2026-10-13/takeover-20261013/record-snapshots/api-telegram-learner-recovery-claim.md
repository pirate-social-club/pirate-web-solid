id: api-telegram-learner-recovery-claim
title: Phase two - recover Telegram learner accounts and prepare admitted pool claims
status: planned
repository: api-next
area: identity
parent: telegram-study-first-amendment
priority: normal
worktree:
branch: feat/telegram-learner-recovery-claim
owner_role: workspace_coordinator
coordination: exclusive
blocked_by: telegram-post-lesson-account-connection-spike
updated: 2026-10-09
closed_at:
review_after: 2026-10-20

This planned phase-two handoff follows
[restricted practice](api-telegram-study-first.md) under
[the draft amendment](telegram-study-first-amendment.md). It records future
source scope without owner ratification, product admission or Rewards activation.
Integrate the approved recovery/session contract into Specs 014/026 first.
Phase-one ownership and retention design cannot wait for this implementation.

Add an anonymous bounded browser recovery purpose through Solid's protected
same-origin API. Verify Pirate-controlled Telegram OIDC, match the numeric id,
resolve independent association conflicts and recover the same learner account
before issuing the api-next-owned session. Preserve account/persona/history
identifiers; recovery creates no second account and moves no balances. This
supports managing practice progress as well as eventual claim access.

Keep state, nonce, S256 PKCE, expiry, atomic callback claim, single-use exchange,
browser binding, exact Origin and CSRF. Distinguish this transaction from
existing-account linking, whose authenticated target and explicit per-bot consent
remain required. Neither community bot credentials nor captured Mini App launch
data recover an account. No durable token or browser principal enters chat.
A phone-input form alone is not OIDC proof; resolve the
[origin investigation](api-telegram-login-origin-diagnosis.md) and capture real
code/ID-token/nonce/sender matching before activating recovery.

Implement the approved future-routing/connection transition only for histories
that satisfy the reviewed empty-monetary-state contract. Retain past practice
attribution and prohibit reward backfill. Financially populated learner accounts
are recovered for their own claims, without silent consolidation, association
movement, recipient replacement or rewritten share/credit history.

Prepare the existing participant-claim API for the recovered same account.
Keep confirmed custody credits, Very personhood/provider-subject guard,
non-expiry, liabilities and payout idempotency. Promote the same restricted
persona through reviewed preparation and provision its wallet on first need;
never select a replacement payout persona. Missing wallet preparation leaves
recipient_pending. Do not broaden bonus/emission verification rules or claim
one-human uniqueness.

Before admitting rewarded lessons, require a separately recorded applicable
legal-eligibility configuration defining acceptable age/geography evidence and
disclosure acknowledgements. Owner preference for chat self-report is not its
own policy-admission receipt. Use chat collection only where the authoritative
policy accepts it; website presence is not evidence by itself. If another check
is required, provide an admitted collection path and disclose it before capture.
Freeze rewarded mode/objectives at that boundary; phase-one sessions remain
practice forever. All existing monetary and release gates still apply.

Acceptance includes exact-account recovery, wrong-identity/owner/copy/replay
attacks, nonce and issuer/audience/signature/algorithm enforcement, conflicts,
original-browser continuation and cancellation/restart. Prove stable persona
promotion, duplicate-account/share prevention, legal-evidence refusal, eligible
pool shares without pre-claim Very, unchanged other-effect rules, no practice
backfill and claim/recipient/payout idempotency. Duplicate accounts still dilute
allocation under Spec 015's ratified trade-off; claim refusal does not repair it.

Follow api-next's governed contract/migration boundaries, generated-client
packaging, focused adversarial/PostgreSQL/native Worker cases and required CI.
Real phone/registered-provider and money acceptance are separate evidence.
Source delivery enables neither production Rewards nor fund transfers; those
require their own exact reviewed release and explicit authorization.

Dependency correction, 2026-10-09. The workspace_owner instructed the coordinator to run the post-lesson account-connection investigation. The phase-one specification is complete and its API code is merged and live; its parked real-phone acceptance does not block research or account recovery source. Replace those obsolete header dependencies with telegram-post-lesson-account-connection-spike. That investigation must establish provider proof and a reviewed account-mapping contract before this implementation lane opens. This is a semantic dependency correction under the owner's account-connection instruction, not mechanical header repair or authority for the monetary scope above. Native OIDC remains the current contract until an independently reviewed amendment chooses another path. Platform-wide 16+ removal is complete and must not reappear in recovery.
