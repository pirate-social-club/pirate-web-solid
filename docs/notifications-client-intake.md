# Notifications generated-client intake

This is contract-only Solid source intake. The frozen `0.121.0` package was
verified by the parent. Final backend source commit/PR binding, backend full
gates, migration/role review, controlled video cutover, serving installation and
paired consumer/live acceptance remain pending. No acceptance is inferred from
the source tests below.

The portable artifact is `vendor/api-client/pirate-api-client-0.121.0-70c02f0a.tgz`,
SHA256 `70c02f0a2fdc7913db52b82a627b1b0bf76e9c3d2eeb7a19770ac5f2f6d138f3`.
Embedded source/OpenAPI identity is
`api-next-contracts@5e2b660bd7dae2b1e840d47dda2610dd0ed8bb0a2f835a8da278296f2990450c`;
embedded client SHA256 is
`280f26c9d99cc03d74d3c9d73bc63d68726f95c9241adaa0e27d7a3ebb0067b3`.
All previous archives and required operation scopes are retained. Only the
generated-client dependency and its lock entry change version.

The exact old/new table comparison is retained in task-local
`.wrangler/adopted-source-agent/client-runtime-diff.json`, with reference-expanded
evidence in `client-runtime-expanded-diff.json`. Existing success/error tables
are unchanged. Seven existing response schemas change: public slug/ID detail
adds the adopted explicit video branch with `route:null`; video soundtrack
origin/song persona references become nullable for account erasure in those
shared projections and post/feed/profile readers. The existing wrapped age
variant remains identical. The new operations are `get_meNotifications`,
`post_meNotificationsNotificationIdRead` and `get_commentsCommentIdLocation`.
Unread count is supplied by the bounded list response; there is no separate
unread-count endpoint in this artifact.

The maintained runtime-table gate retains every previous operation, adds those
three and ordinary `get_postsPostIdComments`, and pins all response/status/error
table bytes to digest
`9a9bb51c0b2c7d51c2ae5ed501ee94a5b99ec88c1e10f7db9fbd68fdeb79e4ea`.
The provenance gate requires the real consumed operations as well. Neither gate
is bypassed. Installed generated code is never edited.

Targeted SSR/preload returns a bounded selector entry only. The browser resolves
the current account before generated detail/resolver reads; private windows
never enter public metadata, SSR payloads or router query caches. Current
session refresh/sign-out cancels private state, and the owning inline controller
revalidates the target branch before continuation. Historical receipt/href bytes
are not changed. The prepared navigation entry must remain unserved until the
parent establishes durable delivery and intended inline target acceptance.

Targeted song playback bypasses the shared feed grant cache and is disposed with
the private route. Ready video requests playback access only after an explicit
play action; pending/unavailable video still renders its authorized inline
thread. Back/Forward cache entry clears private views, and restoration resolves
the current session again.

Parent-run browser cases are in `e2e/notifications-navigation.spec.ts`. Supply
`NOTIFICATIONS_ACCEPTANCE_NOTIFICATION_ID`, `NOTIFICATIONS_ACCEPTANCE_COMMENT_ID`,
`NOTIFICATIONS_ACCEPTANCE_POST_PATH` and
`NOTIFICATIONS_PUBLICATION_EVIDENCE_SHA256` from a real unread durable delivery
and its separately held publication proof. Use the existing managed auth runner;
this source writer never accesses or provisions credentials. After paired serving
admission, run:

```sh
bunx --no-install playwright test -c e2e e2e/notifications-navigation.spec.ts --grep @notifications-navigation
```

That selects desktop and phone navigation, actual rendered focus, unchanged
unread state, back/forward and ordinary first-page reset. Explicit read marking
is separate and requires the parent's mutation authorization/environment:

```sh
E2E_ALLOW_MUTATION=1 bunx --no-install playwright test -c e2e e2e/notifications-navigation.spec.ts --grep @notifications-read-mutation
```

These cases are prepared, type-checked and listed only. Real browser hydration,
negative role/access fixtures and paired delivery/target acceptance remain with
the parent. Repeat the navigation cases with its real text/song/video,
primary/exact-alias and beyond-first-page/depth-eight fixtures; source mocks
establish none of those backend facts.
