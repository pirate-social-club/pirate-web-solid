# Standalone Storybook port gate

The historical `web` repository is immutable source material, not a build or
runtime dependency. A standalone port is not accepted merely because its own
tests, static Storybook build, and source review pass.

## Required origin-diff gate

Every remaining port tranche, including posts and profiles, must declare:

1. the immutable source ref used for the initial source disposition;
2. the final reviewed/accepted `web` ref for every component and story;
3. every review-correction commit between those authorities;
4. a semantic diff showing each accepted correction is either carried or
   deliberately redesigned for a named clean-slate constraint; and
5. focused regression evidence for reactive branching, focus restoration,
   accessible names, live regions, overflow/focusability, contrast, and story
   interactions affected by those corrections.

Commit-message searches and source hashes at an earlier publication snapshot
are insufficient: bulk ports can carry or omit a reviewed hunk without naming
it. Reviewers must inspect the final accepted source and the target hunk.

No port row becomes behaviorally accepted until its source-diff gate and its
standalone browser/axe/interaction gate both pass. Static/source acceptance is
recorded separately and must never be presented as runtime parity.

## Current evidence status

The 37 pre-karaoke story files listed in `storybook-port-evidence.md` are
`source-accepted / recovery-and-runtime-pending`. The status applies to every
story export in those files. Known omissions and browser failures invalidate a
uniform behavioral-parity claim until the recovery tranche and a complete
183-export sweep pass.
