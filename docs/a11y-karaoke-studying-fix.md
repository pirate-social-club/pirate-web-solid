# Karaoke/studying a11y audit tranche

This tranche records the seven target stories for the read-only audit. The
source and SSR checks below are local evidence; browser axe and interaction
results remain runtime-pending until the USB-I/O incident is cleared.

| Story ID | Rule/surface under audit | Source disposition |
| --- | --- | --- |
| `features-karaoke-leaderboard--ranked-entries` | `heading-order`; leaderboard title must be semantic `h2` while retaining h3 visual styling; score text must use the readable primary-text token | Fixed and SSR-covered |
| `features-karaoke-leaderboard--empty` | `heading-order`; empty leaderboard keeps the same semantic section heading | Covered by the same component fix; runtime pending |
| `features-karaoke-routeview--leaderboard-loaded` | `heading-order`; loaded route view exposes the leaderboard section heading as semantic `h2` | Covered by the same component fix; runtime pending |
| `features-studying-surface--say-it-back-wrong-spent-will-return` | `color-contrast`; final miss copy and warning icon use `text-destructive-text` | Fixed in source; runtime pending |
| `features-studying-surface--say-it-back-wrong-spent-final` | `color-contrast`; final miss copy and warning icon use `text-destructive-text` | Fixed in source; runtime pending |
| `features-studying-surface--multiple-choice-submit-error` | `color-contrast`; alert copy uses `text-destructive-text` | Fixed in source; runtime pending |
| `features-studying-surface--complete-streak-qualified` | `prefers-reduced-motion`; streak transition must use the shared Solid 2 owned-write-safe `createMediaQuery` helper | Fixed in source; reactivity contract covered locally; runtime pending |

The standalone app remains clean-slate Solid plus api-next. No Storybook,
Playwright, deploy, push, secret, or remote mutation is part of this tranche.
