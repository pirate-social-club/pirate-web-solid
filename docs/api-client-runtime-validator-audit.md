# Primary API-client runtime-validator audit

This audit compares the production surface still imported from
`@pirate/api-client` 0.25.0 with the target
`@pirate/api-client-happy-path` 0.48.0 at Solid checkpoint
`1646102ae4dd41a14a32f450ecd3f55849f97dc0`.

There are 14 production source files in scope, not the 15 recorded before the
moderation V2 migration. Seven import a runtime client value or error class.
Seven import only generated types, although some of those types describe calls
made through the shared primary-client factory. Tests and stories are excluded.

## Runtime operations

The current production call graph exercises 25 operations through the primary
client:

- Session and identity: `get_personas`, `get_usersMe`,
  `post_authSessionExchange`, `post_authRegister`,
  `post_personasPersonaIdWalletsEvmPrepare`, and
  `post_personasPersonaIdWalletsEvmConfirm`.
- Public identity: `get_publicProfilesHandle`.
- Membership and verification: `get_communitiesCommunityIdJoinEligibility`,
  `post_communitiesCommunityIdJoin`, `post_verificationSessions`, and
  `post_verificationSessionsProofSessionIdComplete`.
- Media submission: `post_communitiesCommunityIdMediaUploadReservations`,
  `post_communitiesCommunityIdMediaPostSubmissions`,
  `post_mediaPostSubmissionsSubmissionIdTerms`,
  `post_mediaPostSubmissionsSubmissionIdLyrics`,
  `post_mediaPostSubmissionsSubmissionIdFinalize`,
  `get_mediaPostSubmissionsSubmissionId`,
  `post_mediaPostSubmissionsSubmissionIdRetry`, and
  `post_mediaPostSubmissionsSubmissionIdCancel`.
- Text engagement: `get_textContentSubmissionsSubmissionId`,
  `post_postsPostIdComments`, `post_postsPostIdVote`,
  `post_postsPostIdClearVote`, `post_commentsCommentIdReplies`, and
  `post_commentsCommentIdReports`.

The seven runtime-value importers are `src/api/client.ts`,
`src/api/privy-session.ts`, `src/api/session.ts`,
`src/features/posts/media-submission/transport.ts`,
`src/features/posts/post-composer/text-submission-transport.ts`,
`src/features/posts/post-engagement/post-engagement-api.ts`, and
`src/features/profiles/public-profile-page/public-profile-preflight.ts`.

The seven type-only importers are `src/api/very.ts`, `src/api/zkpassport.ts`,
`src/features/posts/media-submission/contracts.ts`,
`src/features/posts/media-submission/coordinator.ts`,
`src/features/posts/media-submission/pending.ts`,
`src/features/posts/post-engagement/post-engagement-model.ts`, and
`src/features/profiles/public-profile-page/public-profile-page.model.ts`.

## Result

For every operation above, the generated `RESPONSE_SCHEMAS`,
`SUCCESS_STATUSES`, and `ERROR_DEFINITIONS` entries are structurally identical
between 0.25 and 0.48. Hashing the operation name and canonical JSON for those
three tables in the order listed produces the same SHA-256 in both clients:

```text
a4a802bb5f01962b0500ac7e0a6863c6d1bc364142bbcf204cc2f34d613a4433
```

The all-alias compile proof also passes with the primary, community-route, and
handle-sales aliases resolved to 0.48. No current primary-client response can
be accepted by the 0.48 runtime validator but rejected by the corresponding
0.25 validator, or vice versa, on this operation set. There is no confirmed
runtime drift and therefore no repair task or drift fixture to register.

The comparison is reproducible from the pre-consolidation checkout with:

```text
node scripts/check-api-client-runtime-tables.mjs --compare \
  node_modules/@pirate/api-client/src/generated/client.ts \
  node_modules/@pirate/api-client-happy-path/src/generated/client.ts
```

After consolidation, `bun run check:api-client-runtime-tables` verifies the
retained digest against the single installed 0.48 client and is part of both
the production prebuild and full verification gates.

This result removed the runtime-validator gate for consolidation. The
subsequent consolidation rewrites imports and removes superseded artifacts but
does not weaken generated validation.
