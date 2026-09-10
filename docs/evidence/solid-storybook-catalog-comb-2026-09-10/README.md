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

The 10 MB ledger `lane-comb-fixed2.jsonl` is preserved in the registered
complete-history capture for this lane at
`.archive/solid-storybook-catalog-comb-2026-09-10/` in the pirate-workspace
repository, and its digest is in that capture's manifest. The sweep only
judges branches its stories render, so the findings above are a floor
rather than a complete inventory; the token misuse is enforced by the
lint rule in item 7 rather than by the sweep.
