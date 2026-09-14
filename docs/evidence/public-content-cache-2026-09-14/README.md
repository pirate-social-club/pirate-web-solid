# Public content cache protection

The credential-free public feed loader now bypasses stored HTTP responses.
The sitemap loader does the same and its XML responses are no-store. Thirteen
focused feed and sitemap tests passed; application TypeScript and lint passed.
Existing lint warnings remain in the retained log. No new complete application,
UI or browser run is claimed for these four small changes.

Rollout still needs purge or expiry of old API and sitemap responses. Nothing
was deployed or purged; headers cannot recall previously downloaded content.
