# Staging HNS ingress composition identity

Run `node scripts/hns-ingress-composition-identity.mjs` from this repository.
It prints one non-secret `solid-hns-ingress-sha256:<digest>` reference for the
gateway's `solid_ingress_composition_reference` field. The reference is an
offline source/configuration identity, not a Cloudflare Worker version ID or
proof that a version was deployed.

The v4 scheme derives the ingress runtime closure from classified Worker
adapter edges. Every adapter import or re-export into src/hns-ingress becomes a
root. The public-persona profile model is also explicitly a security root.
Existing ordinary API, verification-config, sitemap and virtual SSR callbacks
are classified application edges and stay outside this boundary. Every new
unclassified adapter edge refuses. Worker adapter bytes remain hashed.

The transitive local closure includes the formerly omitted profile projection
and the frozen public-persona schema and generated validator. Type-only imports
do not enter the graph. Direct and transitive API-client runtime imports,
reexports and dynamic imports refuse, as do computed loads, require/eval,
unreviewed external packages, unresolved paths and symlink escapes. Relative
file and index resolution is supported; unreviewed alias/package edges refuse
rather than silently omit source coverage. Platform runtime modules are pinned
by the existing Worker compatibility settings. The candidate's existing graph
passes the Worker build and API/SSR checks. Unsupported resolution forms refuse
before an identity is emitted; adding support requires its own resolver review.

The fingerprint keeps its solid-hns-ingress-sha256 reference format and versions
its canonical schema and environment projection to v4. Protected routes,
origins, Access configuration, required secret names, replay bindings and
migrations stay included. Gateway references and rollout flags remain excluded
to avoid a digest cycle. The application API-client descriptor is excluded only
after the complete ingress graph has passed its runtime-dependency ban. Client
artifact provenance is still independently checked by the normal product gate.

The public-persona request retains its anonymous GET, manual redirects, strict
JSON 200 response, 404 mapping, byte limit, interrupt deadline and parent
cancellation. scripts/hns-public-persona-validator.py --write deliberately
vendors the exact endpoint schema and generated validator from the pinned
immutable tarball, recording reproducible extraction and hashes. Its default
CI report checks frozen integrity and reports endpoint/schema algorithm drift
without rewriting files or failing on ordinary drift. Existing projection,
privacy, authority lineage, ordering and grant equality checks remain above the
wire validator. Changing frozen validator bytes changes the ingress identity.

Independent review found two inherited gaps. The frozen generated algorithm's
use of `in` accepts undeclared Object.prototype property names, including
constructor, toString and __proto__. The persona JSON parser now rejects those
wire keys at every depth before invoking the unchanged frozen algorithm. The
current endpoint declares none of those property names. This is deliberate
ingress hardening beyond the generated client's behavior; the conformance test
still compares the frozen algorithm itself with that client.

Stream cancellation runs as best-effort cleanup without delaying rejection.
An upstream cancellation promise that never settles therefore cannot hold a
timed-out or parent-cancelled request open. Regression tests exercise both
interruptions with stalled stream cancellation.

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


## Extraction tool and CI scope

The Python program is offline development tooling, not a Worker validator and
not a runtime dependency. It reads only the repository's pinned client tarball,
extracts that endpoint's schema and the exact generated record/schemaError
algorithm, and records their digests. It makes no network request and reads no
credentials. The explicit --write invocation creates the frozen TypeScript
files. Without --write it compares the current pinned client with those files
and reports drift without mutating the frozen implementation.

Runtime response validation happens in public-persona-validator.ts. Its type
predicate evaluates the copied generated algorithm against the copied endpoint
schema before the existing profile/authority projection runs. This preserves
the generated validator's actual behavior; it does not claim to implement
server-side semantic constraints beyond the existing projection checks.

The three-line CI step is the non-blocking drift report expressly requested in
the accepted bounded handoff. continue-on-error keeps parser/framing changes
in a later client from turning the advisory report into a required CI failure.
It does not change any existing required check, automatically re-vendor files,
or publish anything. The source type checks, ingress dependency ban and
security/conformance tests remain blocking. This workflow addition can be
reviewed as a distinct hunk or split into its own source commit; the runtime
change does not rely on that report to accept a request.
