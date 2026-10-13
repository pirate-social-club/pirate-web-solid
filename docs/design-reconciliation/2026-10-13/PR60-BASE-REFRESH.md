# PR60 refresh before integration

The workspace coordinator relays the independent review received on October13.
This document is supplemental direction under the existing full Storybook task;
it is not a source-custody handback, independently attributed acceptance of a
new head, or a report that the cloud writer has received or acted on it.

Published main is f668c090e00b1a5792406075476620aad49f8890. PR60 remains at
67d6b7a87ba1da2756b26cfa30b32a82bb1510bc, with merge base
89b82c8fac90916e30d4bcc7edbf6688282e9b03. The current branch is20 commits ahead
and11 behind main. Its verify, storybook-audit and Solid Doctor checks are green
on67d; they do not verify the union with later accepted main. No textual conflict
or mergeability flag establishes behavioral compatibility.

The active cloud source writer must normally merge fresh main, preserving the
existing histories. Do not squash, rebase, force-push or let the workstation
coordinator adopt the cloud branch. Review the actual resulting source head.

Two overlapping files require explicit retention checks. PR63's loadMore guards
in src/features/posts/video-feed/home-video-feed.tsx reject an immediate cursor
repeat before state changes and deduplicate appended row ids against accepted
rows and within the new page. Preserve those guards and their duplicate/repeat/
same-cursor retry regressions, alongside the Storybook branch's feed changes.
PR65 injects activityDependencies into the first PublicProfilePage test in
src/features/profiles/public-profile-page/public-profile-page.test.tsx. Preserve
that fixture dependency while retaining the cloud's profile layout/feed behavior.
Run the focused feed and profile tests on the resulting union, then current
required verify, storybook-audit and Solid Doctor on the actual refreshed head.
Record first failures, exact head and new acceptance; do not use67d's green as
acceptance of a refreshed union. Integration also needs the fresh authoritative
register check and the existing source review requirement.

The full95-sheet task remains larger than PR60's implemented card/profile/
community/Home/post slices. Preserve the reconciliation log's genuine contract
gaps and unresolved design choices. The95-row baseline mapping is not proof of
95 visually or behaviorally accepted implementations.

Spaces proof/assignment and song-submission source are disjoint from this branch.
The workstation recovery owner is reconciling the already landed naming/Karaoke
foundation and retains the accepted0.116 recovery-client upgrade inside that lane.
The new CI socket-capture task is separately registered under
ci_gate_reliability_coordinator. Neither transfers feed, engagement or persona
source custody from this Storybook writer. Later lifecycle refactors of those
areas should consume the refreshed accepted source after this tranche integrates.
No deployment, API activation, credential or live wallet action is added.
