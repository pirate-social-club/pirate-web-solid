# Staging owner-settings readback

Test source starts at Solid 3edc151ce358dff525c5d0a7e6042d66441d9619.
The approved staging owner account signed in through the maintained Privy
fixture on https://web-next-staging.pirate.sc. No credential, token or cookie
is retained in this receipt. This is staging evidence, not production evidence.

The existing community discovered by membership and owner-capability reads was
community_b37e2a01-8a18-4eec-bc40-194d1a121c2c. Its moderation capability read,
handle-sales management context, sale-namespace list and offering list each
returned 200. HNS root-import discovery returned 404. Direct navigation and
reload of its namespace settings each returned document status 200, with no
route-level denial but with the namespace-denied panel present. The browser
write guard observed zero attempted product writes. No community was created.

The combined live run passed seven tests, failed the explicit HNS diagnostic
and skipped the existing feed-hydration test because its fixture variable was
absent. A second HNS-only run confirmed the endpoint and both page outcomes.
Keep the HNS assertion failing; do not reinterpret disabled or unavailable HNS
as successful onboarding. Staging configuration/authority qualification is
required before import or full chain/DNS acceptance can proceed.

Thirty-one offline E2E-helper tests passed, including three new narrow
anonymous-probe tests. Focused lint, diff whitespace checks and discovery of
57 tests passed. check:e2e typechecking failed in unchanged song code against
the baseline's vendored API client 0.87.0: missing
ListActiveSongMediaPostSubmissionsResponse and
get_communitiesCommunityIdMediaPostSubmissions, with related implicit-any
errors. These changes do not repair that separate generated-client mismatch.

The smoke correction accepts persona 401 only alongside an account-probe 401.
It does not exempt other methods, endpoints, forbidden responses or server
failures. Full regtest/DNS/gateway onboarding and the production 0qcm incident
remain unproven. No deployment or wallet operation was performed.
