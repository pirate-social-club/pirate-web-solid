# Ported Storybook evidence ledger

Status for every row below: **source-accepted / recovery-and-runtime-pending**.

This status means the story is owned by the standalone app and has static
source/provenance evidence, but it does not yet assert reviewed behavioral
parity. The recovery audit found omitted accepted hunks and the first browser
sweep produced 111 explicit axe passes, 12 failures, and 60 indeterminate
results across 183 exports. Counts are evidence, not a pass gate.

## Foundation

- `src/storybook-smoke.stories.tsx`

## Bookings

- `src/features/bookings/add-to-calendar/add-to-calendar.stories.tsx`
- `src/features/bookings/availability-calendar/availability-calendar.stories.tsx`
- `src/features/bookings/booking-cancellation-dialog/booking-cancellation-dialog.stories.tsx`
- `src/features/bookings/booking-checkout/booking-checkout.stories.tsx`
- `src/features/bookings/booking-management-view/booking-management-view.stories.tsx`
- `src/features/bookings/booking-session-controls/booking-session-controls.stories.tsx`
- `src/features/bookings/booking-status-card/booking-status-card.stories.tsx`
- `src/features/bookings/booking-summary/booking-summary.stories.tsx`
- `src/features/bookings/bookings-list/bookings-list.stories.tsx`
- `src/features/bookings/feed-booking-sheet/feed-booking-sheet.stories.tsx`
- `src/features/bookings/host-availability-editor/host-availability-editor.stories.tsx`
- `src/features/bookings/host-booking-page/host-booking-page.stories.tsx`
- `src/features/bookings/profile-book-panel/profile-book-panel.stories.tsx`
- `src/features/bookings/profile-bookings-section/profile-bookings-section.stories.tsx`
- `src/features/bookings/slot-picker/slot-picker.stories.tsx`

## Community

- `src/features/community/action-callout-panel/action-callout-panel.stories.tsx`
- `src/features/community/archive-page/archive-page.stories.tsx`
- `src/features/community/join-request-modal/join-request-modal.stories.tsx`
- `src/features/community/links-editor/links-editor.stories.tsx`
- `src/features/community/membership-requests-page/membership-requests-page.stories.tsx`
- `src/features/community/page-shell/page-shell.stories.tsx`
- `src/features/community/popular-communities-rail/popular-communities-rail.stories.tsx`
- `src/features/community/rules-editor/rules-editor.stories.tsx`
- `src/features/community/sidebar/sidebar.stories.tsx`
- `src/features/community/your-communities-page/your-communities-page.stories.tsx`

## Shell

- `src/features/shell/app-shell-chrome/app-shell-chrome.stories.tsx`
- `src/features/shell/app-shell/app-shell.stories.tsx`
- `src/features/shell/app-sidebar/app-sidebar.stories.tsx`
- `src/features/shell/content-rail-shell/content-rail-shell.stories.tsx`
- `src/features/shell/mobile-route-shell/mobile-route-shell.stories.tsx`
- `src/features/shell/page-shell/page-shell.stories.tsx`

## Wallet

- `src/features/wallet/song-purchase-modal/song-purchase-modal.stories.tsx`
- `src/features/wallet/wallet-hub.stories.tsx`
- `src/features/wallet/wallet-visuals.tsx`
- `src/features/wallet/wallet-receive-sheet.stories.tsx`
- `src/features/wallet/wallet-send-sheet.stories.tsx`
