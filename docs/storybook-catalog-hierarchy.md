# Storybook catalog hierarchy

Two catalogs, and they do not overlap. The design-system catalog at
`packages/solid-ui/.storybook` (port 6007) owns primitives and patterns under
`Foundations`, `Components`, and `Patterns`. The app catalog at
`.storybook` (port 6006) owns everything built on top of them and sorts its
titles in this order:

    Flows / Screens / Parts / Foundations

The top segment says what the story *is*, not which feature it belongs to. The
feature is always the second segment, so `Flows/Community/Create` and
`Parts/Community/Sidebar` sit in different tiers of the same domain.

`Flows` is a multi-step journey a person moves through, with one story per step
or outcome. Sign-in, community creation, and each post type live here. A flow
file should carry at least one interactive story whose `play` walks the whole
happy path, plus a failure story showing where a failed attempt lands.

`Screens` is a route-level view or a shell that hosts one: the app shell, page
shells, the public feed, the wallet hub, moderation pages. If a router would
render it directly, it is a screen.

`Parts` is everything below screen level that belongs to a feature rather than
the design system: sheets, dialogs, rails, sidebars, pickers, status cards.
A component reusable across features belongs in `packages/solid-ui` and gets a
`Patterns` story in the other catalog instead.

`Foundations` in the app catalog holds only the smoke story. Colour, type,
spacing, motion, radius, and icons are documented in the design-system catalog.

## Adding a story

Pick the tier by asking what the story is, then name the feature, then the
component: `Parts/Bookings/SlotPicker`. Keep `a11y: { test: "error" }` on the
meta — the sweep in `scripts/storybook-a11y-sweep.mjs` treats violations as
failures, and stories are expected to pass rather than opt out.

Prefer driving the real model over hand-building states. `sign-in-modal.stories.tsx`
and `create-community.stories.tsx` both stand up a stub controller over the
production transition functions, so the catalog renders production views over
production logic and never reaches the network.
