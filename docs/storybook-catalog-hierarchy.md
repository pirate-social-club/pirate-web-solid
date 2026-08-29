# Storybook catalog hierarchy

One catalog at `.storybook` (port 6006) holds everything: the app stories and
the design-system package that backs them, so a token can be reviewed on its
Foundations page and in the screens that use it without switching runners. It
sorts titles in this order:

    Flows / Screens / Parts / Foundations / Components / Patterns / Internal

`packages/solid-ui/.storybook` (port 6007) still runs the same design-system
stories in isolation, with app code out of the Vite graph. It is a narrower
view for working on primitives, not a second source of truth.

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
`Patterns` story instead.

`Foundations`, `Components` and `Patterns` belong to the design system in
`packages/solid-ui`: the colour, type, spacing, motion, radius and icon docs,
the primitives, and the cross-feature patterns. A component reusable across
features belongs there rather than in `src/features`.

`Internal` holds the catalog's own smoke story and nothing else.

The global story layout is `centered`, which is what the design-system stories
expect. A story that needs the full viewport sets `layout: "fullscreen"` on its
meta, as the flows and shells do.

## Adding a story

Pick the tier by asking what the story is, then name the feature, then the
component: `Parts/Bookings/SlotPicker`. Keep `a11y: { test: "error" }` on the
meta — the sweep in `scripts/storybook-a11y-sweep.mjs` treats violations as
failures, and stories are expected to pass rather than opt out.

Prefer driving the real model over hand-building states. `sign-in-modal.stories.tsx`
and `create-community.stories.tsx` both stand up a stub controller over the
production transition functions, so the catalog renders production views over
production logic and never reaches the network.
