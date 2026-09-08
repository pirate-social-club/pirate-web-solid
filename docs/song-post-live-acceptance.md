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

The reset's fixed 0001–0119 manifest is not the new-flow migration receipt.
Require the separately reviewed song-staging-reference-migration-delta handoff:
the complete applied ledger for the serving API, explicitly including
0132_song_reference_decision_wakeup.sql and
0133_song_reference_publication_resume.sql with verified checksums, before the
Worker requiring them serves this acceptance. Keep the approved database,
producers, ingress release order and original reset artifacts intact. A handoff
that only verifies 0119 leaves acceptance blocked.

Record the serving Solid and api-next commit SHAs, deployment identifiers,
origin, UTC start time, browser version and authorized test persona/community.
Verify the serving revisions, rather than assuming branch tips are deployed.
Use the ordinary product session and same-origin CSRF-protected requests.
Record fixture hashes and expected outcomes without recording cookies, tokens,
Access secrets, database credentials or unsanitized request headers.

Arrange authorized audio fixtures: an original with reviewed lyrics, an
original deliberately without lyrics, a real derivative with a resolvable
source asset, and approved material that naturally exercises manual review
and policy block. Case 5 needs explicit authorization for two new posts: the
source recording and its derivative, their file hashes, personas/community,
source commercial-remix terms and separately approved derivative terms. If no approved fixture or deterministic live route to an
outcome exists, mark that case blocked. Do not alter policy or provider results
to manufacture a pass. The derivative source must exist on this serving pair
and be eligible under its current rights policy. Do not schedule case 5 until
api-song-source-recording-authority supplies an implemented, approved way to
establish the published source's server-held recording identity. Publishing a
no-match original alone does not establish it. The two-post authorization does
not expand the separate one-original production canary.

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
5. This is a source-then-derivative sequence on one unchanged serving pair.
   It remains blocked until legitimate source establishment is available.
   The resolver repair is integrated at API 4db8d1df; source integration and
   component fixtures alone do not satisfy the entry conditions above.

   First publish the approved project-owned source song through the browser.
   Use commercial-remix terms with an explicitly approved nonzero
   commercial_remix_share_bps, called B in the case ledger. Record the source
   file hash, submission and published post/asset identifiers, publication
   time, immutable terms revision, license and exact B. Confirm source playback.
   Establish and verify the source recording authority through its separately
   approved mechanism. Retain authorized server evidence references and the
   source audio/analysis revisions and hash without exposing private blobs.
   If that authority cannot be established, stop here and record blocked;
   do not seed a provider match or upload the derivative speculatively.

   Reverify the same serving API/Solid SHAs before uploading the approved real
   derivative of that source. Record its distinct file hash and submission.
   Use a separately approved offered remix term different from B so inherited
   share resolution is observable. Its beneficiary split still sums to 10000;
   neither that split nor its offered downstream term sets the upstream share.
   Observe a natural reference_required decision. An unexpected provider
   outcome is recorded as such; never change the result to reach this branch.

   Record the reference request and current creation revision. Enter the
   published source asset identifier and bind it. Confirm the request carries
   current reference_request_ref and expected_creation_revision without an
   author-supplied upstream share. Verify through authorized server readback
   that the binding names the selected source, uses verified recording evidence
   and inherits B from that source's immutable terms. Record the current
   derivative audio/hash and analysis fences as well as source evidence;
   do not mislabel the binding's current-submission fences as source revisions.

   Observe recovery through decision to publication, preserving the accepted
   derivative terms at its new creation revision. If a response is lost,
   reconnect and retry the retained command; verify exact replay, one binding
   effect and no duplicate post. Success requires exactly one source post and
   one derivative post for this case, normal derivative playback and the
   applicable reference presentation. Record each publication separately from
   enrichment. If further rights or manual review is required, record that real
   state and use only its separately authorized path; binding alone is not a
   pass. If the serving pair changes during the sequence, stop and arrange a
   new authorized case on a verified pair rather than combining deployments.

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
reason. For case 5 include both posts, both file hashes, their shared serving
pair, source-authority references, immutable source terms and B, the derivative's
distinct offered term, observed inherited share, binding/replay evidence and
separate publication/enrichment results. State which outcomes were observed live and which remain local-test
claims. Acceptance requires both ordinary originals plus the applicable
recovery and terminal cases above; unresolved cases remain explicit gates.

Before integration, recheck main and both concurrent Solid lanes. If the merge
result differs from the reviewed head, review the combined change and rerun the
checks affected by that difference. This runbook does not authorize merge or
deployment and does not clear the independent production credential-cleanup
confirmation.

## Known UX debt

Reference-required recovery currently asks for a source song asset identifier.
The backend repair implements verified binding; live eligibility still requires
source authority and the reviewed deployment. The registered solid-song-source-picker
successor owns a searchable picker once a source-asset lookup contract exists. That follow-up must
specify eligible-source filtering, selection, unavailable sources and recovery;
it must preserve the current revision/request-reference binding and exact replay.
There is no invented lookup endpoint in this acceptance procedure.

Off-platform sources remain rejected by default. The registered
song-off-platform-reference-policy decision owns whether such works are
postable and whether manual review may ever admit them. This procedure does
not grant that authority or treat rejection as a bug to bypass. Those decisions
do not block verified on-platform acceptance once its prerequisites are met.
