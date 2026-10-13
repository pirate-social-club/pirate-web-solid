id: api-telegram-http-practice-regression
title: Fix the HTTP Worker running Telegram updates without the practice service
status: parked
repository: api-next
area: study
parent: api-telegram-study-first
priority: high
worktree:
branch: fix/telegram-practice-ending-staging-release
owner_role: workspace_owner
coordination: exclusive
blocked_by: none
updated: 2026-10-08
closed_at:
review_after: 2026-10-22

api-next pull request 585 (main 4819b9bc) moved Telegram update processing
into the HTTP Worker. `buildTelegramServices` in
`packages/platform-cf/src/telegram-runtime.ts` builds a base services object,
gives its wake callbacks a closure over that object, and then returns a
different object with the practice service attached. The queue consumer uses
the returned object. The new inline path uses the captured one, which has no
practice service, so a real webhook update is handled as a discovery-only bot.

The workspace_owner saw exactly that on the staging pilot bot: song titles
printed as text and repeated as website buttons, and Help describing browsing.
The synthetic staging checks inserted inbox rows for the jobs scanner and never
entered the webhook path, so they passed. The diagnosis is recorded by the
coordinator in the staging root at
`handoffs/telegram-study-ux-latency-2026-10-08/HTTP-PRACTICE-REGRESSION.md`.

Fix the composition so inline and queued processing use the same final
services object. Add a regression test that goes through the webhook accept
function with the HTTP defer option against a real database and inspects what
is sent: /start, the Songs menu action, Help, a song tap and Resume must all
take the practice path, with callback buttons only, no website links and only
practice-catalogue songs. Deploy through the maintained wrapper and establish
one real webhook-to-practice-picker trace on staging before asking for another
phone run.

Merged and branch header, 2026-10-08. Pull request 588 was squash-merged as 5ac53087e7447f0abfa8633e707522a93fcd1036 after independent reviews of 61de7e8c and ce072ca5 and green hosted checks. The staging release must be built from a commit reachable from main, so the executor moved the lane checkout to that commit and left it on a detached HEAD, which the task check correctly reported as a breach while another session was waiting on a green register. The lane is now on the named branch fix/telegram-http-practice-staging-release at 5ac53087, and the header names it. The feature branch fix/telegram-http-practice-service is kept untouched in the repository at ce072ca59bdb806300b9b18953a3c66f7dd156dc; its remote copy was deleted by the merge, and its two commits are also the head of pull request 588. It is to be captured when the lane is closed. The staging jobs Worker is version 51f12e38-c11a-46c6-98b0-00f245c34bdf from 5ac53087; the HTTP Worker release, the real webhook trace and phone acceptance are still open.

Staging release, 2026-10-08. Both staging Workers serve 5ac53087 at 100 percent: jobs version 51f12e38-c11a-46c6-98b0-00f245c34bdf, released first at 18:34 UTC with no binding change against 9993d91b, so scheduled root renewal stays on, and HTTP version 0c020126-f989-46fc-922d-aabf884a3148, released at 18:49 UTC through scripts/deploy-worker-with-provenance.ts. The HTTP release was refused once on the known HNS_OWNER_VERIFIER representation difference and admitted with a dated receipt after an independent read-only review reproduced both hashes and found no other binding differing. No migration; the staging ledger is 0246 with 246 rows. Read back afterwards, each version has Telegram and practice enabled, the pilot community, one practice post and the transcription key and learner-audio bindings by name, and an unauthenticated request to a webhook path that does not exist returns 401, which the HTTP Worker answers only when its Telegram services composed. A fake-sender run through the staging inbox on the new jobs Worker showed the song list on /start, one identity and one ten-card practice-only session from a doubled song tap, no attestation, and the prompt with the notice repeated on /resume before any voice reply. Evidence: archive/telegram-http-practice-regression-staging-2026-10-08 in the staging root.

Not yet proven. No real Telegram update has been observed on the new versions, so the regression is not yet shown fixed on the path a phone takes. The fake-sender run goes through the jobs scanner and does not count. The executor did not forge a webhook request: the bot's webhook secret is sealed application data that only the Worker opens, and opening it on a workstation would be a new credential workflow outside the approved ones. The test phone was locked with a credential. The workspace_owner is therefore asked for one /start, read back with webhook-trace-read.ts in the evidence package, before the ten-card run and /resume. Read over the workspace_owner's three messages at 16:48 UTC, before this release, the same query showed the inline path taking 1.1 to 3.0 seconds from acceptance to delivered reply, against 16 to 25 seconds on the first release.

Follow-ups, all low, required before any production release of Telegram practice and needing a new lane. From the review of ce072ca5, recorded on pull request 588: set the disclosed flag only for a turn whose prompt carried the notice; make the prompt lookup require a stored force-reply prompt; add tests for a voice note that is not a reply, /cancel, the epoch reset and persistence through the real store; bound the lyric line, not the combined message, so a very long line cannot truncate the notice; correct one test comment and the pilot document's wording. From the earlier review of pull request 585, listed in api-telegram-study-first: scanner starvation when fifty or more prompts wait on verdict retries, a pending predecessor at ten attempts not treated as abandoned, verdict retries driven only by the scanner, and the inline log reporting a caught handler error as handled.

Real path proven and ten cards completed, 2026-10-08. The workspace_owner's /start at 18:54:41 UTC on the new versions was answered with "Choose a song to study:" and callback buttons 1.3 seconds after acceptance, and the song tap with the first prompt after 2.2 seconds, each on its first attempt and inside the HTTP Worker. That is the real webhook-to-practice-picker trace the diagnosis required, and it supersedes "not yet proven" above for the regression itself. Twelve voice answers followed; every verdict was its own message ahead of the next prompt, with the next prompt delivered 3.3 to 7.1 seconds after the voice note was accepted. The session completed at 18:59 UTC with "Lesson complete" and 8/10 on first try. Evidence: owner-run-trace.log in archive/telegram-http-practice-regression-staging-2026-10-08, transcribed speech redacted. /resume has not been exercised on a real client and remains open.

Owner ruling on the notice, 2026-10-08. Seeing the paragraph about who can hear voice notes on the first prompt, the workspace_owner said "still have junk in here", and to a proposal to move it elsewhere: "no, remove it completely i don't want that crap in there". The bot is therefore to carry no voice-access notice anywhere. This overrides the notice rule merged in pull request 588 and makes the first, third and fifth low findings from the review of ce072ca5 moot once it lands; Spec 026 still says one short notice at entry and needs an amendment recording the ruling. The change exists as uncommitted edits in the lane: the prompt is the instruction and the line only, the disclosed flag and the catalog key are gone, and the sentence about the owner in /help is removed in all three catalogs. It is not committed, reviewed or released.

On hold at the workspace_owner's request. Before any review, hosted checks or release of that change they asked to discuss three product questions, which are open: how a lesson ends (today the score line and nothing after it; the legacy bot added a celebration mark and a streak line), whether a streak is kept (none today, because practice accounts produce no reward qualification), and when a learner signs in (never today; the Connect action is off because Telegram login fails). The executor's recommendations were given to the workspace_owner in the session and are not decisions.

Coordinator continuation, 2026-10-08. The workspace_owner instructed this session to finish PR 590 review fixes, CI, merge and the staging rollout, and to record the notice contract amendment and planned streak/account-connection follow-ups. The prior executor reported a usage-limit stop and checkpointed all source at 613c6e34. Fresh status was clean and the reflog unchanged; the coordinator now holds source and staging execution for this continuation. The checkout is on the published PR branch fix/telegram-practice-ending-no-notice. Prior writer sessions must not resume writes or deploys concurrently. The notice removal and completion flow are approved; no auth implementation, rewards activation or production deployment is included. Phone Resume and acceptance of the new clean prompt/ending remain open after rollout.

PR 590 continuation checkpoint, 2026-10-08. The coordinator pushed final source
80d3bc5cc336ee8bfdbfadf58d3bb9b78208bcd8 after fixing same-song replay coverage,
refused-start wording, restored failed-start coverage and stale documentation.
Independent review of that exact source and Spec 026 source bbe88db found no
remaining functional or contract defect. Full local check passed; unit tests
5742 pass, 3 skip, 0 fail; Node22 and native Worker234 pass. Hosted CI is running.
Spec 026 integrated at a967a665; its lane has retired complete with verified
history preservation. Practice streak and post-lesson account-connection spike
are planned records, with the latter coordinating existing phase-two recovery.

This continuation holds staging HTTP and jobs release custody for PR 590 under
standing authorization. Production, rewards, grants and credentials are excluded.
The maintained HTTP wrapper requires a sibling Solid path. A temporary symlink
at .worktrees/api-next/pirate-web-solid will point only to the existing canonical
Solid checkout for the unchanged wrapper's HNS and serving acceptance gates.
There will be no tracked Solid changes or HNS mutation; those gates may create
normal staging sign-in sessions and ignored browser artifacts. Remove only that
unchanged symlink after rollout. No source copy or alternate checkout is used.
HTTP's one HNS_OWNER_VERIFIER representation difference was independently
reproduced; issue a fresh exact merged-source review before upload and verify
its staging-named target afterward. Both Workers retain current Telegram flags.
Source and predecessor branches are captured in telegram-practice-ending-2026-10-08.
Phone acceptance of the new ending and Resume remains required after rollout.

PR 590 merged, 2026-10-08. All twelve hosted checks passed on exact head
80d3bc5c, including the required check, postgres17 and secret-boundary. The live
register passed again with 1057 records. The coordinator squash-merged the
reviewed source through GitHub as b8332919dcc4235058d15c277b2de1a8755bfeda.
The lane moves to its named staging-release branch at that accepted commit;
the feature tips remain preserved. Both maintained staging wrappers now use
that exact source, with fresh binding checks and a dated independent HTTP
representation review. No migration or runtime flag change is included.

PR 590 staging rollout and custody handback, 2026-10-08. Jobs version
26aa2ad8-b41e-41dc-a307-aa1a402557ae and HTTP version
4c785542-8e5f-4c09-9303-1a69ae1cc5d8 serve accepted source b8332919 at 100 percent.
Both maintained wrappers completed; the HTTP HNS serving/browser gate passed.
Serving readback verifies Git provenance, unchanged Telegram/practice activation,
one pilot song, and the staging-named HNS verifier after its reviewed metadata
representation difference. The initial jobs attempt stopped before upload for
missing database environment; the maintained managed credential runner resolved
it. No migration, serving-role grant, token or production change was made.

The deployed jobs recovery path showed one song button without duplicate text
or website links, the clean two-line prompt with force_reply, and Resume on the
same session and line. Its pre-existing fake learner gained no age attestation,
qualification or credential. One additional fake practice session remains.
The cleanup helper incorrectly expected cancel to erase the session; documented
behavior preserves Study progress. The corrected assertion and a read-only
final-state check passed; the failed initial log is retained honestly. The
synthetic run proves recovery processing, not real webhook or phone delivery.
The prior real ten-card 8/10 run remains the grading proof. New ending/buttons
and real-client Resume await the workspace_owner: /resume for the completed
ending, Practice again for the clean prompt, then /resume to repeat it.

The temporary Solid symlink is removed, both canonical source checkouts remain
unchanged and clean, no process uses this source lane, and reviewed predecessor
history is registered in the October capture ledger. The lifecycle command parked the lane; source and staging release custody
return to the coordinator
register with no pending deploy. Evidence is the staging archive package
telegram-practice-ending-2026-10-08. Account connection and streaks are separate
planned records.
