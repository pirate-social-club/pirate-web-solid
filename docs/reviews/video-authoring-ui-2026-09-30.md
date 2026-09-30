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
