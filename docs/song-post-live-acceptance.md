# Song posting live acceptance

This is an unexecuted browser acceptance procedure for the connected song flow.
Local fixtures and unavailable-API hydration checks cannot satisfy it. Record
pass, fail, or blocked for each case; never substitute a mocked response for
live evidence.

## Entry conditions

The exclusive api-staging-persona-reset-runner lane must release the staging
surface after its provider/CLI wiring, parent verification and publication
gates. Its verified Access operator configuration and a staging database
connection with pg_read_all_stats or superuser visibility remain prerequisites
owned outside this song lane. Obtain the current handoff from that lane before
executing; this document grants no live mutation or operator authority.

Record the serving Solid and api-next commit SHAs, deployment identifiers,
origin, UTC start time, browser version and authorized test persona/community.
Verify the serving revisions, rather than assuming branch tips are deployed.
Use the ordinary product session and same-origin CSRF-protected requests.
Record fixture hashes and expected outcomes without recording cookies, tokens,
Access secrets, database credentials or unsanitized request headers.

Arrange authorized audio fixtures: an original with reviewed lyrics, an
original deliberately without lyrics, a real derivative with a resolvable
source asset, and approved material that naturally exercises manual review
and policy block. If no approved fixture or deterministic live route to an
outcome exists, mark that case blocked. Do not alter policy or provider results
to manufacture a pass. The derivative source must exist on this serving pair
and be eligible under its current rights policy.

## Browser procedure

1. Open Create post through the product, choose Song, and select the original
   with lyrics. Verify native playback, duration and embedded artwork against
   the actual file. Finish upload. Record the submission identifier, accepted
   audio revision and upload/finalize time. Confirm no terms were submitted
   and no post published while the author was still reviewing lyrics.
2. Enter and edit lyrics while processing observations occur. Confirm the
   edits survive refresh observations. Continue through royalties with valid
   recipient identities and a nontrivial exact split. Confirm the review shows
   the intended split and playable audio. Submit through any required post
   sheet. Record that accepted lyrics exactly match the reviewed text before
   terms are accepted. Observe publication without pressing Check status.
3. Confirm exactly one published post appears, the dialog closes appropriately,
   and the published asset plays through the normal product surface. Verify
   applicable lyrics/enrichment through their product paths and authorized
   read-only evidence. Record pending enrichment separately from publication;
   do not describe missing applicable enrichment as full acceptance.
4. Repeat with the lyrics-free original, deliberately leaving lyrics empty.
   Confirm publication and playback without phantom lyrics. In a separate
   retained draft with already accepted lyrics, clear the box and verify that
   submission refuses to silently discard them.
5. Blocked as of 2026-09-08: api-song-reference-resolver-hookup must prove
   production reference binding before this case is scheduled. At API a1803de3,
   default HTTP composition omits referenceResolver and /reference throws
   Media reference resolution is unavailable. The Solid identifier input and
   local fixtures do not clear this blocker. After the repair is integrated
   and the serving pair is verified, submit the real derivative until
   reference-required recovery appears.
   Record the reference request and creation revision. Enter the eligible
   source asset identifier, bind it, and observe the real next state. Confirm
   the request carries the current reference_request_ref and
   expected_creation_revision. If a response is lost, reconnect and retry;
   confirm the retained command is replayed exactly and has only one effect.
   Do not assume binding necessarily means immediate publication: record any
   additional rights or review decision imposed by the live service.
6. Exercise manual review with the approved fixture. Verify its visible state,
   continued bounded observation and absence of premature publication. Any
   reviewer decision must be made through the separately authorized review
   surface. Observe the resulting terminal transition without manual refresh.
   If no authorized reviewer transition is available, record the transition
   as blocked rather than accepting only the intermediate state.
7. Exercise the policy-block fixture. Confirm the terminal explanation, no
   publication, stopped observation and appropriate close behavior. Reopen
   the retained state and verify it cannot be published by resubmitting.
8. During processing, disconnect and reconnect the browser; verify visible
   observation failure and manual recovery. Close and reopen the dialog to
   verify restoration of exact terms, lyrics and submission identity without
   duplicate publication. Verify a community/persona conflict prevents reuse
   under a different identity. Exercise cancellation on a separate eligible
   draft and confirm its actual terminal result.

## Timing and terminal evidence

For each case record UTC times for finalize, each meaningful observed status,
reference or review binding, terms acceptance, terminal snapshot and publication
callback. Correlate browser submission identifiers with authorized backend
observations. Check that observation stops after terminal state and dialog
closure, and that a terminal snapshot produces only one publication callback.

The observer allows 200 eligible refresh attempts at a three-second interval,
roughly ten minutes of active polling. Busy or suppressed ticks do not consume
that budget. During the independently authorized production canary, compare
actual queue and processing durations with this budget. A naturally longer
job must enter a visible paused state and allow Check status to recover the
actual terminal result. Do not prolong or interfere with production jobs to
force this case. If no long-running case occurs, record cap behavior as locally
tested only and retain production timing assessment as open.

## Evidence and disposition

Attach a sanitized case ledger containing fixture hash, serving pair,
submission/post identifiers, observed transitions and timestamps, expected and
actual outcomes, playback/enrichment evidence, and any failure or blocked
reason. State which outcomes were observed live and which remain local-test
claims. Acceptance requires both ordinary originals plus the applicable
recovery and terminal cases above; unresolved cases remain explicit gates.

Before integration, recheck main and both concurrent Solid lanes. If the merge
result differs from the reviewed head, review the combined change and rerun the
checks affected by that difference. This runbook does not authorize merge or
deployment and does not clear the independent production credential-cleanup
confirmation.

## Known UX debt

Reference-required recovery currently asks for a source song asset identifier.
The contract-backed binding is functional, but the product needs a searchable
source picker once a source-asset lookup contract exists. That follow-up must
specify eligible-source filtering, selection, unavailable sources and recovery;
it must preserve the current revision/request-reference binding and exact replay.
There is no invented lookup endpoint in this acceptance procedure.
