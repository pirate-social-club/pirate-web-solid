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
