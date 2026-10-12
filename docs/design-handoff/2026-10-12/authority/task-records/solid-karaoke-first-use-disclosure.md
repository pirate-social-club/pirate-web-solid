id: solid-karaoke-first-use-disclosure
title: Present the Spec 019 first-use retention disclosure before Karaoke microphone capture
status: complete
repository: pirate-web-solid
area: study
parent:
priority: high
worktree:
branch: fix/karaoke-first-use-disclosure
owner_role: pirate-web-solid Karaoke disclosure repair writer
coordination: exclusive
blocked_by:
updated: 2026-09-13
closed_at: 2026-09-13
review_after:

Close the prerequisite defect recorded in the Study/Karaoke acceptance
runbook (<workstation-staging>/handoffs/STUDY-KARAOKE-ACCEPTANCE-RUNBOOK-2026-09-13.md):
karaoke-route-view.tsx contains no participant-facing first-use disclosure,
while spec 019 section 5.1 requires one before learner-facing microphone
capture, and the 2026-09-12 audit recorded that Karaoke carries retention in
its adapter types without presenting it to the participant. The merged
Study repair covered the Study flow only.

Implement the disclosure in the Karaoke session route, mirroring the Study
pattern: a first-use dialog naming ElevenLabs and its stored provider
retention plus the platform's 24-month private retention and deletion path,
shown before the scoring session can start capture; acknowledgment persisted
under a karaoke-scoped key; Cancel leaves capture unstarted; acknowledgment
resumes the pending start. Both start paths in the route (the direct
singing start and the persona-choice continuation) must pass through the
same gate. A regression test must prove microphone capture cannot begin
before acknowledgment: with capture represented by the injected scoring
controller's start boundary, no scoring start or session creation may occur
until the disclosure is accepted, and the acknowledged path may start
without the dialog.

Scope limits: no provider calls or recordings are needed; this lane does
not change scoring, the Study disclosure, or the recorder lifecycle.
Acceptance requires focused route tests for the blocked and acknowledged
paths, the repository's pinned typecheck, oxlint, Biome and the hosted
verify/storybook-audit gates. Publication follows the repository's governed
Radicle-first flow with a separate exact-SHA publication decision;
deployment remains separately authorized work.

Implementation, publication and closure — 2026-09-13. Branch
fix/karaoke-first-use-disclosure was based on published main 25c0396 and
implemented in the admitted lane worktree. Commit 24e94f3 gates every
scored-take start in karaoke-route-view.tsx behind the first-use
disclosure: the direct start and the persona-choice continuation route
through one beginScoredTake boundary, Cancel clears the pending take, and
acknowledgment persists under karaoke:microphone-disclosure:v1 before
resuming. The route tests prove the capture boundary — no scoring start or
session creation — is unreachable until acceptance, and that acknowledged
sessions start without the dialog; the shared mount seeds the flag so the
existing persona tests keep their subject. Local gates on the merged tree:
karaoke vitest 16 tests passed; oxlint and Biome were clean. The local tsc
readout in this session came from a pipeline without pipefail, so its exit
status is not attributable to tsc and is not cited as evidence; the hosted
verify gate on the exact published head is the typecheck evidence.

PR #27 opened against main; the branch merged published main b12e0e2
(composer lineage) as merge commit 0b2edba, and hosted CI on that exact
head passed verify, storybook-audit (all stories) and Solid Doctor.
Publication followed the governed flow: canonical main fast-forwarded to
0b2edba, `scripts/publish-main --sha
0b2edbac852a5bd4529c086d16ea11158c90efe7 --execute` advanced Radicle first,
synchronized the seed and mirrored GitHub; both mains report 0b2edba and
PR #27 is merged by ancestry. The lane worktree was retired through
bin/worktree-close --status complete. The acceptance runbook was updated:
the Karaoke disclosure prerequisite is resolved and K0/K4 are now active
checks against Solid 0b2edba. No provider calls, recordings, uploads or
deployments occurred.
