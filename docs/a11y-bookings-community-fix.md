# Bookings/community a11y recovery

This tranche addresses the owned findings from the validated Storybook sweep
ledger `/tmp/standalone-axe-sweep.jsonl`. The current USB-I/O incident prevented
a fresh browser rerun, so the runtime gate remains pending until the same
targeted stories can be replayed on a healthy checkout.

| Story | Before | Change | Expected result |
| --- | --- | --- | --- |
| `app-bookings-availabilitycalendar--owner-read-only-preview` | `color-contrast` (serious); unavailable read-only chips applied `opacity-50` to their text | Keep the skeleton surface but use the semantic `text-card-foreground` token instead of whole-chip opacity | Unavailable slot text remains readable in read-only mode |
| `compositions-bookings-bookingmanagementview--loading` | `aria-prohibited-attr` (serious); `aria-label` was attached to a plain `div` | Give the loading region `role="status"` and `aria-busy="true"` | Loading announcement is valid and exposed as a status |
| `compositions-bookings-bookingmanagementview--failure` | `color-contrast` (serious); error heading used `text-destructive` | Use the contrast-safe `text-destructive-text` token for the heading | Error heading has a semantic readable foreground |
| `compositions-bookings-hostavailabilityeditor--default` | Play cleared a controlled number input and immediately typed, allowing the clamp rerender to turn the intended `0` into a different value | Exercise the minimum clamp with one `clear` operation before asserting `5` | Stable controlled-input interaction |
| `compositions-bookings-profilebookpanel--mode-transition` | Play searched for exact text `$50` although the viewer facts line contains duration, price, and timezone | Match the price as `/\$50/` after asserting the reactive viewer branch | Stable reactive mode-transition interaction |
| `compositions-community-yourcommunitiespage--default` | Play used a singular role query while `Signal Room` appears in both Following and Joined | Select the first result from the explicit `getAllByRole` set | Stable duplicate-list-item interaction |

The Join Request modal was not part of the final stable five-story failure set
and is intentionally unchanged in this lane.
