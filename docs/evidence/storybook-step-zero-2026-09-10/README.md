# Storybook step zero sweep (2026-09-10)

Full unfiltered axe and interaction sweep of the step-zero landing on
`fix/storybook-step-zero` off main `6498fcc`, run against the production
Storybook build served from `storybook-static`:

    node scripts/storybook-a11y-sweep.mjs \
      --base-url http://127.0.0.1:6006 --retry-count 0

The build selected 146 files and 729 stories. Axe reports 729 passes,
zero violations and 141 incomplete checks, which are reported separately
and are not violations. Interactions report 724 passes and five
failures, all song-composer stories that the audit baseline records as
belonging to the composer lane:

- `flows-posts-createpostform--song-step-1-song`
- `flows-posts-createpostform--song-step-1-song-mobile`
- `flows-posts-createpostform--song-step-four-review`
- `parts-posts-songsteps--entered-from-text-post`
- `parts-posts-songsteps--step-three`

The reserved community page-shell action row now carries `role="group"`,
which clears the four `aria-prohibited-attr` violations the audit found
on every `/c/<segment>` page, and the AlertDialog story waits for focus
to return after the close transition instead of asserting within it.
This matches the step-zero package's expectation exactly.

`sweep-summary-landmark-fix.txt` is the full unfiltered sweep after the
landmark fix. `StudyRouteShell` and `StudyRouteLoadFailureState` now render
`<section>` instead of `<main>`, leaving the single landmark to the route
view, and the studying route and route-state story files wrap their
subjects in `<main>` the way V2 does in production. The result is unchanged
from the landing sweep: 729 axe passes, zero violations, and the same five
song-composer interaction failures.

`sweep-summary-wizard-headings.txt` is the composer run after each song step
gained its `h2` from the step's own copy. All composer stories pass axe with
zero violations. The heading resolves the `entered-from-text-post` product
question — that story now clears its `heading "Song"` assertion and fails
only on the stale `getByLabelText("Song title")` query, which belongs to the
catalog-comb lane's assertion repairs along with the other four composer
stories. The convention is recorded at
`docs/design/a11y-wizard-step-headings.md`.

`sweep-summary-composer-repairs-full.txt` is the complete unfiltered sweep
at the combined tip: step zero plus the four composer assertion repairs
taken by path from the catalog-comb lane. It is the first fully green full
sweep for this lane — 729 of 729 accessibility passes with zero
violations and 729 of 729 interactions, exit PASS. With this tip the main
catalog's only remaining reds are the token substitution and the
owner-settings `role="status"`, both of which have their own dispositions.
