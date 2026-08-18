# Standalone storybook review-fix recovery

This tranche compares the standalone Solid sources with the final accepted
`web/solid` sources and the named correction commits. It records semantic
disposition rather than relying on commit-message matches.

## Bookings

| Origin ref | Source hunk | Standalone disposition | Evidence |
| --- | --- | --- | --- |
| `c7dbd298` | `ProfileBookPanel` selects owner/viewer through a reactive `createMemo` and `Show`; adds an SSR viewer branch assertion | **recovered/adapted** in `profile-book-panel.tsx`; SSR semantics are covered by `profile-book-panel-rendered.test.tsx` and prop-transition behavior by the `ModeTransition` story play | Mode transition now renders the viewer branch after changing `mode`; owner and viewer SSR assertions remain distinct |
| `e1ff72b7` | Final accepted `ProfileBookPanel` retains the reactive branch | **present**; the standalone component preserves its route-neutral callbacks and Solid-only props | No React, router, session, or legacy dependency was imported |

## Community join request

| Origin ref | Source hunk | Standalone disposition | Evidence |
| --- | --- | --- | --- |
| `1ecb5c16` | Stable generated note ID, textarea ref for initial focus, accessible label/counter, responsive content sizing, opener-focus harness | **present/adapted** in the standalone modal and story; imports use standalone UI and locale modules | Default story play checks initial textarea focus, submit semantics, close, and opener focus |
| `68f7f04f` | Forward resolved direction to portaled modal content | **present/adapted** as `ModalContent dir={resolvedDir()}`; standalone `ModalContent` explicitly accepts and forwards `dir` | Default story play checks the portaled dialog has `dir="rtl"` |
| `26b95990` | Type opener focus target through the native focus event | **superseded by final harness**; the final accepted native button/ref form from `99354dee` is present | Default story play checks focus after close |
| `99354dee` | Use a native typed reopen button so focus restoration is deterministic | **present** in the standalone story | Reopen control is a native `button type="button"` with a stable ref |
| `8576a811` | Resolve document direction before locale fallback | **present/adapted** in `resolvedDir()`; invalid document values are ignored and standalone locale direction is used as fallback | Default story play checks RTL content direction; textarea retains `dir="auto"` |
| `e1ff72b7` | Final accepted join-request modal/story focus, direction, and accessibility behavior | **present/adapted**; standalone modal primitives inherit direction from `ModalContent`, while unsupported `dir` props on wrapper typography are intentionally not copied | Focus, close restoration, direction, label association, counter, submitting, and submitted plays cover the behavior |

The browser/axe evidence for this tranche remains runtime-pending until the
standalone Storybook dependency bootstrap and a clean browser sweep are
available. Source/SSR evidence does not replace that runtime gate.

