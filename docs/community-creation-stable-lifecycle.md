Community creation keeps its form mounted through account resolution, saving,
activation and publication. Pending feedback is confined to the existing Create
button. Failure feedback has reserved space. Saved intents restore the draft;
committed resources redirect on reload and after activation without another
commit. A submitted wait state continues when ready. A failed status read stops
pending feedback and permits an explicit retry. Merely loading an uncommitted
intent never authorizes publication.

Community name and description remain editable after a failed saved creation.
The next Create click saves those changes with optimistic revision checks before
continuing. Background reads preserve edited values. The reserved public profile
stays locked, matching the API restriction on changing a minted owner. The open
wire policy is validated before reconstructing editable fields; unsupported
policies are rejected instead of silently replaced. Session ownership checks,
request idempotency and prompt cancellation remain in force.

Manage now opens the moderation queue, which is the capability that controls
its visibility. Both main and the serving release already map all /c/ settings
paths to standard application chrome, so no speculative chrome policy change is
included. A production read-only transaction verified that the reported community
and account are active, the creator matches the reported account, its owner
assignment is active, and the moderation predicate grants view and action.
That database result is not an authenticated HTTP response. The operator's
signed-in capabilities response is still needed to diagnose the reported route
failure. No community, persona, role or wallet assignment was changed.

Provider-session restoration remains unresolved. The shipped Privy adapter
passes MemoryOnlyStorage and clears it in finishSession; no persisted provider
session exists after a reload. The SDK's supported browser persistence adapter
is LocalStorage, and initialize restores sessions from that storage. This is
confirmed by the installed 0.70.0 SDK and
https://docs.privy.io/recipes/core-js. Enabling it changes the existing explicit
memory-only policy and requires the pending workspace_owner decision. This
checkpoint does not enable persistence, weaken proof requirements, or claim
that repeated confirmation is fixed. Provider-managed storage would also need
logout, account-switch and later-page activation coverage before release.

This is a review checkpoint on fix/community-creation-stable-lifecycle based on
main 56ea88d, not a production deployment. The eventual release must carry only
accepted fixes onto release/community-owner-activation; unrelated main video
work must not ship through this task. The existing production community remains
untouched. Final gate receipts and the checkpoint SHA belong in the workspace
task record.

Verification on September 7: 539 application tests, 140 API tests and the
40 focused creation tests pass. TypeScript, lint with warnings, production
build and its provenance/runtime-table checks pass. All ten creation Storybook
variants pass interactions and axe with zero violations; nine incomplete axe
checks are reported separately. Desktop and mobile browser fixtures verify
SSR form presence, unchanged form dimensions/labels through submission and
failure, a bound first profile, private interrupted setup, dismissal, resumed
publication and committed-intent reload. These fixtures intercept writes;
they do not create a production community or provision a real provider wallet.
The initial development-server hydration timeout was followed by successful
checks against built production assets, not treated as a pass itself.


The follow-up bounds each wait attempt to one minute or the intent expiry,
whichever comes first. A timeout leaves the same draft retryable. Poll-driven
continuation cannot open interactive confirmation; it returns control to the
Create button. Owner validation precedes enabling continuation.

Owner settings retain the application chrome and now use a desktop section
sidebar, with horizontal navigation on small screens. Names, Address, Moderation
queue and Content policy remain reachable according to their independent API
results. An unexpected failed capability check keeps its sections visible as
retryable errors without granting authority or redirecting to another section.
A redacted response still hides unauthorized sections.

Follow-up verification: 543 application tests and 140 API tests pass, along
with TypeScript, lint with warnings, production and Storybook builds. Twenty
creation and owner-shell stories pass interactions and axe with zero violations;
thirteen incomplete checks remain separately reported. Desktop and mobile
built-asset creation fixtures pass again. Visual inspection includes the
reserved failure area on desktop and mobile. Provider persistence remains
pending an explicit decision; none of these checks proves later-page silent
provider activation or authenticated production moderation HTTP access.
