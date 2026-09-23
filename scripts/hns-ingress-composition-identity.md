# Staging HNS ingress composition identity

Run `node scripts/hns-ingress-composition-identity.mjs` from this repository.
It prints one non-secret `solid-hns-ingress-sha256:<digest>` reference for the
gateway's `solid_ingress_composition_reference` field. The reference is an
offline source/configuration identity, not a Cloudflare Worker version ID or
proof that a version was deployed.

The script hashes compact JSON with schema `solid-hns-ingress-fingerprint-v2`.
It contains SHA-256 digests of the twenty explicitly listed source files in
`hns-ingress-composition-identity.mjs`, including `src/worker.ts`, and a
projection of staging's protected route, origins, Access settings, forwarder
registry identity and timing, required-secret names, replay binding and
migration, Worker compatibility settings, the disabled handle-host variables,
and the pinned vendored `@pirate/api-client` dependency from `package.json`.
The source list is fixed; discovery refuses newly added production ingress
modules until reviewed.

The projection deliberately omits the community gateway deployment reference
and community rollout enable flag. Changing either must leave the identity
unchanged; changing the Worker disabled-host guard, protected route or security
bindings must change it. Handle-host ingress must remain disabled, and its ingress,
Access, authority and gateway fields must remain empty. The other handle-host
variables are fingerprinted; any new one requires review. The vendored client
descriptor must name a versioned tarball; the repository's provenance gate
separately checks its bytes. The tests enforce these properties. Secret values,
upload timestamps and Cloudflare version IDs never enter the identity.

For release, compute the reference from a clean, reviewed source checkout.
Record that checkout's commit and local build digest separately. After upload,
record and read back the deployed Worker version ID, script etag and bindings
against the upload receipt. A version tag alone is not source proof. If any
fingerprinted source or projected setting changes, compute a new reference and
gateway manifest digest before enabling HNS.

## Scope limits

The identity binds the ingress transport and security boundary: the HNS
ingress modules, the Worker's dispatch and disabled-host guard, and the
protected staging configuration listed above. It does not bind the application
served through that boundary once HNS is enabled. The community composition
dispatches to the ordinary Solid application, so changes to the SSR bundle,
`src/api/verification-config.ts`, non-HNS variables such as
`VERIFICATION_UI_ENABLED` or `PRIVY_APP_ID`, bundler configuration, or a new
non-HNS binding can change what the protected hostname serves without changing
this identity. The top-level `assets` configuration is also outside the
projection: with the default `run_worker_first`, static files are served on the
protected hostname without invoking the Worker, so they bypass the
disabled-host guard and, once enabled, forwarder authentication; only Access
protects them. Production has the same property and those files are public on
the canonical host. Treat the identity as proof of the ingress boundary, not of
the served application; release evidence records the full source commit and
build digest separately.
