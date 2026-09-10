# Catalog comb sweep summary

Filtered axe and interaction sweep of the `solid-storybook-catalog-comb`
story files, run on 2026-09-10 against the lane tip `e2ae7a0` before the
evidence commit. It was produced from a local Storybook dev server on
port 6098 with the lane's seven story files selected:

    node scripts/storybook-a11y-sweep.mjs \
      --base-url http://127.0.0.1:6098 \
      --filter 'legal-placeholder|sign-in-panel|your-communities-route|public-post\.stories|home-video-feed\.stories|community-creation-route-view|owner-settings-route-view' \
      --retry-count 0 --story-timeout-ms 90000

The sweep selected 7 files and 41 stories. All 41 interactions pass. Axe
reports 38 passes and three violation failures, each recorded against its
owner in `tasks/records/solid-storybook-catalog-comb.md`:

- `screens-community-communitycreationroute--profiles-unavailable` and
  `--unavailable`: serious `color-contrast` on `p[role="alert"]`, the
  bare `text-destructive` utility using the `--destructive` fill as a
  text colour. Audit plan item 7 owns the substitution across its ten
  class sites in five files.
- `screens-community-ownersettingsroute--loading`: minor
  `aria-allowed-role`, `role="status"` on a `<main>` in
  `owner-settings-route-view.tsx`.

`sweep-summary-before-final-fix.txt` is the intermediate run that still
held the bot-probe absence assertion, kept so the correction can be
audited against the failure it removed.

`sweep-summary-action-error-story.txt` is a later run on the same day,
after `Screens/Community/YourCommunitiesRoute` gained
`PostCheckProfilesUnavailable`, which drives the `actionError()` branch at
`your-communities-route.tsx:243`. That file's seven stories all pass
interaction, and axe reports the same serious `color-contrast` failure on
the alert, corroborating item 7's token finding from a second route.

`sweep-summary-sections.txt` is the section-controller run:
`Screens/Community/OwnerSettingsRoute` gained names, address, telegram,
moderation queue, and entered-while-unavailable stories, each mounting the
real controller through a typed per-port stub. The file's thirteen stories
all pass interaction; the only axe failure is the already-recorded
`role="status"` on this route's loading `<main>`, so the ratchet's set
gains no member. The production build for that run has 776 story entries
plus 65 docs and 159 titles.

The 10 MB ledger `lane-comb-fixed2.jsonl` is preserved in the registered
complete-history capture for this lane at
`.archive/solid-storybook-catalog-comb-2026-09-10/` in the pirate-workspace
repository, and its digest is in that capture's manifest. The sweep only
judges branches its stories render, so the findings above are a floor
rather than a complete inventory; the token misuse is enforced by the
lint rule in item 7 rather than by the sweep.

`sweep-summary-study-v2.txt` is the study v2 route run: eleven stories for
`study-v2-route-view`, all eleven interactions passing. Four of them
(`auth-required`, `profiles-unavailable`, `no-community-persona`,
`cards-processing`) carry the same landmark findings because the studying
state components rendered their own `<main>` inside the route's. That
defect is admitted to the ratchet under the step-zero lane, which fixes it
in `9e13362`; these stories lose the axe failures once the fix reaches
main.

`sweep-summary-composer-repairs.txt` is the composer assertion repair run.
Four stale assertions now query the title field by accessible name, assert
the review step's Rights summary, and target the footer Review action
rather than the same-named nav item; all four pass, and the file's axe
result is clean. The single remaining failure is
`parts-posts-songsteps--entered-from-text-post`, which asserts the step
heading fixed in `7a3d1f7`; that defect is admitted to the ratchet under
the step-zero lane and leaves the set when the fix reaches main. The
duplicate accessible name on the nav Review and the forward action is
recorded as a minor naming finding.
