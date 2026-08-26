# HNS Solid ingress references

The Worker contains a production-capable external-community ingress graph, but
base, staging, and production remain explicitly disabled. The declarations in
`wrangler.jsonc` are references and fail-closed placeholders. They do not
authorize provisioning, secret creation, binding changes, deployment, or a
public host.

The binding declaration is not side-effect-free once deployed. The first
deployment carrying this configuration to an environment creates the
`HNS_COMMUNITY_APP_REPLAY` namespace and applies SQLite migration `v1` even
while ingress remains disabled. That first post-merge deployment is therefore
a reviewed provisioning step in the accepted operation plan, not an unrelated
application release.

The accepted operation plan must populate one environment as a single tuple.
It must replace every unresolved HNS value in that environment and change
`HNS_COMMUNITY_APP_INGRESS_ENABLED` only in the same reviewed deployment.
Staging and production canonical origins, api-next origins, Access resources,
Privy applications, gateway references, forwarder keys, and replay namespaces
must never be mixed.

The public community-handle composition is a separate, read-only graph. It is
also disabled in every declared environment. It has no replay binding, browser
session, API proxy credential, write path, or asset path. Its protected Solid
boundary uses `HNS_HANDLE_HOST_INGRESS_ORIGIN`,
`HNS_HANDLE_HOST_ACCESS_ISSUER`, `HNS_HANDLE_HOST_ACCESS_JWKS_URL`, and
`HNS_HANDLE_HOST_ACCESS_AUDIENCE`. Canonical profile metadata and rendering
use `HNS_HANDLE_HOST_CANONICAL_ORIGIN`, which v1 requires to be exactly
`https://pirate.sc`.

The handle composition reads public persona data anonymously from
`HNS_HANDLE_HOST_PUBLIC_API_ORIGIN`. Its only protected api-next call is the
current-authority endpoint selected by `HNS_HANDLE_HOST_AUTHORITY_ORIGIN` and
`HNS_HANDLE_HOST_GATEWAY_DEPLOYMENT_REFERENCE`, using the secret bindings
`HNS_HANDLE_HOST_AUTHORITY_ACCESS_CLIENT_ID` and
`HNS_HANDLE_HOST_AUTHORITY_ACCESS_CLIENT_SECRET`. Enabling the graph requires
all of those values in one reviewed deployment. The source configuration and
this document create no Access application, service token, route, secret,
deployment, DNS record, certificate, or HNS authority.

The protected Solid ingress uses the nonsecret references
`HNS_COMMUNITY_APP_INGRESS_ORIGIN`, `HNS_COMMUNITY_APP_ACCESS_ISSUER`,
`HNS_COMMUNITY_APP_ACCESS_JWKS_URL`, and
`HNS_COMMUNITY_APP_ACCESS_AUDIENCE`. The exact canonical rendering origin is
`HNS_COMMUNITY_APP_CANONICAL_ORIGIN`. Every origin value is the exact serialized
`URL.origin`: HTTPS only, no credentials, port, path, query, fragment, or
trailing slash. For example, `https://app.example/` is a misconfiguration.

The protected api-next forwarding boundary uses
`HNS_COMMUNITY_APP_API_ORIGIN` and the secret bindings
`HNS_COMMUNITY_APP_API_ACCESS_CLIENT_ID` and
`HNS_COMMUNITY_APP_API_ACCESS_CLIENT_SECRET`. It is deliberately separate from
the ordinary browser-facing `API_NEXT_ORIGIN`.

The private current-authority boundary uses
`HNS_COMMUNITY_APP_AUTHORITY_ORIGIN`,
`HNS_COMMUNITY_APP_GATEWAY_DEPLOYMENT_REFERENCE`, and the distinct secret
bindings `HNS_COMMUNITY_APP_AUTHORITY_ACCESS_CLIENT_ID` and
`HNS_COMMUNITY_APP_AUTHORITY_ACCESS_CLIENT_SECRET`. Runtime configuration
rejects reuse of either protected-api credential for this boundary. The API
and current-authority paths may share one exact protected api-next origin and
one pinned Access audience. Their service-token client ids and secrets remain
pairwise different so Access policy can grant and revoke the two callers
independently.

Forwarder-v3 verification uses
`HNS_FORWARDER_V3_KEY_REGISTRY_REFERENCE`,
`HNS_FORWARDER_V3_KEY_REGISTRY_VERSION`,
`HNS_FORWARDER_V3_FRESHNESS_WINDOW_SECONDS`, and
`HNS_FORWARDER_V3_FUTURE_CLOCK_SKEW_SECONDS`. Key bytes exist only in the
`HNS_FORWARDER_V3_HMAC_KEY_REGISTRY` secret binding. The document must use the
exact `pirate-hns-forwarder-v3-key-registry-v1` schema and match both declared
registry identifiers.

`HNS_COMMUNITY_APP_REPLAY` is a SQLite Durable Object binding. Its adapter
uses the fixed Solid consumer scope
`pirate:hns-forwarder-v3:pirate-web-solid-community-app:v1`, shards by key id,
and retains an unsafe nonce through the complete forwarder freshness window.
It is separate from the gateway and api-next replay consumers. Expired rows
are pruned only when another nonce is consumed in the same key-id shard. A
retired key's untouched shard therefore retains its expired rows; the set is
bounded by accepted unsafe requests during that key's active lifetime, but
there is no automatic global cleanup. The operation plan must name that
retention behavior and any later namespace cleanup or destruction ceremony.

Never retain real secret values, production key bytes, Access assertions,
session cookies, or CSRF values in a plan, transcript, error, repository file,
command line, or test fixture. The operation transcript records only binding
names, resource references, versions, and redacted success or failure
evidence.
