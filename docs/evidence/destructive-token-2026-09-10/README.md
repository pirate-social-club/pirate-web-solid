# Destructive-token substitution and loading-status repair (2026-09-10)

Two small accessibility repairs the catalog-comb lane surfaced.

The bare `text-destructive` utility uses the `--destructive` fill token as
a text colour, which fails AA on dark surfaces: `#db2b33` on `#0a0a0a`
measures 4.15:1. Ten class usages across five files now use
`--destructive-text` (`#f66d67` at 6.88:1): five in
`royalty-split-editor.tsx`, two in `attachment-card.tsx`, and one each in
`create-community.tsx`, `community-archive-page.tsx` and
`your-communities-route.tsx`. The two absence guards in
`booking-rendered.test.tsx` and `studying-surface-rendered.test.tsx` are
untouched and stay as written.

A new local oxlint rule, `design-tokens/no-bare-destructive-text`, forbids
the bare utility so it cannot return. It matches only `text-destructive`
not followed by a hyphen, and test files are exempt by configuration
because their guards assert the misuse is not rendered.

`owner-settings-route-view.tsx` put `role="status"` on the loading
`<main>`, which axe reports as `aria-allowed-role`; the status now sits on
an inner paragraph and the landmark stays clean.

`text-destructive-text` is now used 44 times and
`text-destructive-foreground` once; no bare `text-destructive` remains
outside the two tests.

## Sweep

`sweep-summary.txt` is the complete unfiltered run at this tip: axe 726
pass, zero violations, three indeterminate, and interactions 726 pass,
zero failures, three indeterminate. All three indeterminates are
`story_finished_timeout` on `Screens/Community/OwnerSettings/Shell`
stories, which the machine timed out during a loaded run rather than any
assertion failure. `sweep-summary-shell-rerun.txt` reruns those three
stories warm and they pass 3 of 3 on both axe and interaction, so the
effective result is 729 of 729 accessibility passes, zero violations and
729 of 729 interactions.
