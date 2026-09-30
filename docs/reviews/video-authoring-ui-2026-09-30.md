# Video authoring UI review

The workspace_owner reviewed the local source-stamp catalog at 958b281 on
2026-09-30 and requested an audit of song choice, loading, unavailable songs,
blocked playback, backgrounding and the adult checkbox. Browser inspection at
390 by 844 confirmed the complaints in the production components used by those
stories. The unavailable screen was also inspected at desktop width.

The song screen built bespoke chrome despite the existing MobilePageHeader,
Spinner and ActionFooterShell. Back appeared at the right. A disabled Continue
remained beside loading and failure messages. No selection repeated the header
instruction in a second hint. The action row followed content rather than
occupying a consistent footer. The local correction reuses the existing shared
structures, removes the redundant hint, shows accessible spinners, and offers
Continue only when an excerpt can be confirmed.

The refused guide warning was outside a capture surface that already filled
the viewport. At phone width the additional prose pushed recording controls
below the viewport. The correction puts capture notices inside that surface and
review notices within the scrolling review body. Refused playback no longer
attributes failure to sound settings without evidence.

The camera recovery prompt also appeared spuriously in unrelated stories. The
story preview was an empty MediaStream, which the real video element could not
play. The corrected harness supplies a generated canvas video stream, reuses it
when capture takes ownership, and stops drawing once its tracks end. The actual
production recovery remains available and is labelled Resume camera preview.
This fixture is not evidence of real phone camera or audio acceptance.

The adult checkbox belonged to production review, not fixture controls. It is
removed at the workspace_owner's request. Existing restored ratings and the API
contract remain intact; new drafts still use the existing general default.
This change does not establish how server classification is implemented.

The song picker still makes selection depend on first activating preview to
reveal Use. That remains a discovery problem. Selection and preview should be
separate visible actions in a subsequent correction. Submitted upload, provider
failure and rejection layouts also need visual review; this audit does not claim
that every authoring state is visually accepted.

Story interaction checks previously asserted the rejected prose and redundant
hint. Those checks proved reachable states and retained the design. The local
correction updates them to check accessible loading, useful actions and absence
of the adult checkbox. Source identity and story coverage do not measure design
quality. Continue reviewing actual rendered states at phone width.

This is local UI work. It does not alter recording interruption detection,
renderer contracts, publication holds, staging, or the Pixel acceptance result.

Further owner review exposed behavior as well as copy problems. Mobile advance
now checks song playback before opening capture. A refusal remains on the song
screen with an explicit retry, and a later refusal during recording cancels the
take and returns to song choice. The capture/review song label contains only the
title. The playback check is bounded and invalidated if the selection changes.

Length refusal had instructed the author to shorten a clip using a start-only
slider. The corrected refusal offers another song instead of an impossible
operation. Ineligible songs also stay on song choice, without excerpt controls.
The policy reasons remain in the internal contract. The UI does not expose
server terminology or owner policy mechanics.

Simulation buttons are removed from the story harness. Story interaction code
triggers guide interruption and backgrounding directly. Recording interruption
now states that the song stopped and asks for a new take. Camera and upload
stories explicitly select their mode instead of replacing window.matchMedia
for the whole catalog. Dedicated desktop upload and review stories cover the
shared flow's upload branch. Real desktop chooses upload by the existing input
and viewport detection; no new desktop recording branch was added.

The archived source-stamp Storybook on 6006 was stopped at the owner's request.
The updated local UI review continues on 6008. No staging change occurred.

Desktop inspection also found the harness constrained the production review to
phone width while desktop media queries selected two columns. The caption became
a narrow strip. The harness now matches the full-width production overlay.
Upload mode uses shared page navigation and the pinned file-picker action rather
than camera chrome. It returns to song choice with Back. Review remains shared
and its action follows the content's maximum width.

The second rendered audit identified the remaining submitted-video screens,
profile and community dead ends, inconsistent backgrounding, and duplicate
Capture stories. These findings supersede the earlier local completion claim.

Submitted videos now use the shared page frame, one status sentence, and one
primary action. An expired upload cancels and clears its receipt through one
Start over action. A definitive refusal also starts fresh. Upload failures offer
one retry. Another-community uploads link to the existing community-ID route.
A finished upload goes Home, including a lost finalization response; its durable
receipt remains for reconciliation and duplicate prevention. That receipt is
created only after Publish, and is not an editable draft.

Profile selection is available before capture, and capture cannot open without
an eligible profile. Age-restricted songs offer another song without promising
an unavailable verification flow. Backgrounding and song interruption both
cancel recording and discard the partial video. Backgrounding during asynchronous
capture startup also cancels the returned session. The guide stall detector is
unchanged.

Review blockers appear before the preview and disable Publish. Uploaded files
are admitted with the advertised 15-second maximum; a separate measured-duration
guard catches a bypassed inspector. Guided recordings preserve their required
timing tail. Desktop shares these review and status components.

The separate Capture catalog is removed. Its camera permission and orientation
recovery cases now run through Authoring. Obsolete shorter-clip, trimming,
cancelled-upload, and prose documentation stories are removed. Preview failures
have asserted play functions and contain no simulation buttons. The generated
camera and guide clock remain simulations; these checks do not establish real
Pixel synchronization or settle the previously unexplained discarded recording.

Phone inspection then found two failures that text-presence assertions missed:
a fixed shared header covered the status sentence, and the portrait preview
clipped its playback control and error message. Status headers now occupy their
normal page space. Preview media shrinks around its controls and feedback.
Browser bounds assertions check the status is below the header and preview
feedback is inside its frame. Posting details now precede the preview, making
the destination and profile visible before Publish. Preview copy avoids guessing
that sound settings caused a refusal. Unused song-range status prose is removed.

Age restriction and upload-expiry stories finish in their named states. The
one-action expiry recovery is exercised separately by the runtime regression.
The upload-confirmation story is removed because successful bytes go Home;
the runtime tests prove navigation and preserved receipt identity without
presenting a mock navigation callback as another composer screen.

The later owner decisions remove video post text and inherit the host’s active
community profile, with no profile selector or destination prose inside the
flow. An absent or invalid active profile cannot silently choose another
eligible profile. The host prepares identity before capture.

Review now constrains its width to 58 viewport-height units multiplied by 9/16,
so height and width stay proportional on phones and desktop. Playback is an
accessible full-frame tap target with a play icon while paused; controls and
recovery feedback overlay the video. A stall stops both players and exposes
Play for a deliberate retry, rather than leaving a Pause action on stopped
media. Uploading disables playback and changes the publication button to show
progress while preserving the existing video element. A retry preserves that
video and the exact reservation and start command, with a plain upload failure
message rather than a raw transport error. Existing retained-upload recovery
continues to use its status surface. This does not add a background upload
owner or change the guide detector.

The owner requested stopping Storybook to free resources for gaming. The owned
6008 service is stopped. Focused checks use one worker at low priority; builds,
full verification, TypeScript and browser geometry/interaction sweeps are
pending for this continuation. The previously passed visual checks apply only
to eb96fd9. A new Storybook ratio assertion will verify the portrait fix when
the visual gate resumes. Private Dance API work and the broader shared-flow
prototype remain with their separately registered follow-on lanes.

## Follow-up from independent review

The branch was rebased onto d4377cbb096e14df4ddf6c8a6c65039ca6227ad4.
A missing or invalid inherited community profile now shows an entry prerequisite
with a real community link, before mounting song choice or capture. It does not
choose another profile. A retained submitted upload keeps its original identity
and remains recoverable. The host no longer substitutes its first profile when
entering video or resets the video identity through its text/song effect.

Song refusal copy distinguishes permission, missing songs, age restrictions,
length and settings-read failure. The song settings-read failure offers a retry;
length and permanent song restrictions offer another song. An invalid part keeps
the selector, and a late definitive refusal retains one Start over action.

The earlier 15 incomplete axe rules per sweep were eight color-contrast checks
and seven video-caption checks. Capture error text had no independent backdrop
over a live video. Those panels now have a black background and explicit white
secondary actions, so text contrast does not depend on camera imagery. Review
error text remains white on 75% black; even a white underlying pixel yields a
background no lighter than rgb(64, 64, 64), with contrast above 10:1.

The seven caption checks concern generated story media: canvas video contains
no spoken dialogue, and the song fixture is a tone. They do not demonstrate
accessibility of arbitrary uploaded speech or song lyrics. Closed captions are
a separate missing capability; removing the post description field does not
resolve that question. No caption-support claim or real-device acceptance is
made by this audit. The browser checks will assess the final rendered panels
and keep the remaining incomplete rules visible in their ledgers.
