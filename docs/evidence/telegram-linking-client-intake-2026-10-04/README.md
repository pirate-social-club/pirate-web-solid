# Telegram linking client intake

The linking journey consumes immutable API client 0.108.0 from reviewed API
commit ad366454cc066fca324ca418066d8b7320004592. The artifact SHA-256 is
1f2c7042c40f57a33343d2946fa543c40e20739c342578bdbba6d3a35a54d9c3.
The API OpenAPI digest is
9f3816b75603f325668ff2d7087cd692fb160065862ad5729d4a8810c87071dd,
and the generated client digest is
5d8690a83cbf68cb78b835fd88f987e5a67f3fd392f3ab2869242758abc3e32d.
The old 0.102.0 artifact remains retained.

Comparison of all 95 previously guarded operations found exactly one change:
get_communitiesCommunityIdHnsRootImports permits optional binding_generation
in a non-null attachment. The required fields, success statuses and declared
errors are unchanged. The application already ignores this extra projection;
the ordinary standalone type check passed after intake. Full verification is
still required. runtime-drift.json contains the complete changed table entry.

The runtime-table guard retains the existing 95 operations and adds all eight
Telegram linking operations. Its reviewed 103-operation digest is
713a9a40d7813fe5040c2b0933850b9355ab4ebeeabf02e9500faa44a09f23f4. Generated response validation remains enabled. The provenance guard
also requires these operations; there is no new client alias or runtime import
from the API checkout.

The first intake checks refused the old runtime-table digest as intended.
The test-discovery command was initially invoked with Node, which cannot use
its Bun-specific import.meta.dir; its owning bun run command is required.
This note does not claim full gates, source publication, staging deployment,
credential provisioning or real Telegram acceptance.
