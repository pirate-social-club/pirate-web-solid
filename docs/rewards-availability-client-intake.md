# Rewards availability production snapshot

This bounded source snapshot starts from deployed website c15c1406 and adds the reviewed Rewards consumer with generated client 0.142.0. It excludes the leaderboard presentation and Telegram controls introduced by PRs 158 and 160. Those remain accepted on the integration branch with separate runtime ownership.

The portable client comes from API PR 713, accepted as 236f5a67de0d66b8c832116cfde619fe168eebf0. Its archive SHA-256 is 49603d6657d47a6da16cd83235c1cb815c1eb5cb0053b0c6d69a7a6058efc81e. Existing vendored archives remain unchanged. This snapshot upgrades directly from client 0.139.0; it does not claim to contain the intermediate frontend intakes.

The direct comparison covers all 291 previous generated operations. No operation, success-status entry or declared error changes. The only previous response-schema change is post_communitiesCommunityIdCanonicalRouteOwnershipRecoveryPoll, which this website source does not call. Package declarations and the lockfile change only the API client. The installed client is additionally checked against the complete 156-operation runtime pin, including the new availability operation.

Authenticated GET /rewards/availability reports effective configuration with no-store. Disabled skips qualification-policy requests and hides financial qualification requirements while preserving activity standing. Enabled provider failures remain typed and retryable. Account, session and cancellation fences remain in place; SSR reads neither route.

This source snapshot requires its own exact review, build and browser qualification. It must follow verified delivery of the compatible availability API. It does not enable Rewards or Telegram, add Study migration 334, change credentials, or establish acceptance of the reported production login incident. Full integration-branch intake facts remain in the consumer PR and its own source version of this document.
