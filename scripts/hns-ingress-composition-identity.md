# Staging HNS ingress composition identity

Run `node scripts/hns-ingress-composition-identity.mjs` from this repository.
It prints one non-secret `solid-hns-ingress-sha256:<digest>` reference for the
gateway's `solid_ingress_composition_reference` field. The reference is an
offline source/configuration identity, not a Cloudflare Worker version ID or
proof that a version was deployed.

The script hashes compact JSON with schema `solid-hns-ingress-fingerprint-v1`.
It contains SHA-256 digests of the twenty explicitly listed source files in
`hns-ingress-composition-identity.mjs`, including `src/worker.ts`, and a
projection of staging's protected route, origins, Access settings, forwarder
registry identity and timing, required-secret names, replay binding and
migration, and Worker compatibility settings. The source list is fixed;
discovery refuses newly added production ingress modules until reviewed.

The projection deliberately omits the gateway deployment reference and
rollout enable flag. Changing either must leave the identity unchanged;
changing the Worker disabled-host guard, protected route or security bindings
must change it. The tests enforce those properties. Secret values, upload
timestamps and Cloudflare version IDs never enter the identity.

For release, compute the reference from a clean, reviewed source checkout.
Record that checkout's commit and local build digest separately. After upload,
record and read back the deployed Worker version ID, script etag and bindings
against the upload receipt. A version tag alone is not source proof. If any
fingerprinted source or projected setting changes, compute a new reference and
gateway manifest digest before enabling HNS.
