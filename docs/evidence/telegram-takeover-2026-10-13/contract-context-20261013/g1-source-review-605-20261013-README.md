# Independent source review, October 13

This additive package binds api-next PR605 head 4a20cc598a9371536ad2dddbbd4269cc6a82c2fb and Solid recovery head bd319b438e6e8ef92235050fb6475f957efe110b. It records two source blockers and the cloud continuation direction. The prior sealed takeover files and manifests are unchanged.

The cancellation boundary and proposed 23-function EXECUTE block pass source review. PR605 still needs its preflight to refuse a role that can SET ROLE to an owner despite not inheriting that owner's privileges. The exact 170-row preflight accepted such a role in an isolated native PostgreSQL 17.11 fixture. SET ROLE then made all 147 denied functions executable. PostgreSQL distinguishes immediate USAGE and SET access in its [access privilege documentation](https://www.postgresql.org/docs/17/functions-info.html#FUNCTIONS-INFO-ACCESS-TABLE).

The prepared Solid whole-PR revert restores an equality-only privacy classifier for existing Telegram linking routes. Eighteen spellings route through the pinned router, and fifteen aliases retain synthetic callback query values under the reverted SSR conditional. The corrected source classifies and refuses those aliases. Prepare a probe-removal successor that retains the shared privacy fixes and regression tests.

Both scripts embed the fetched source and blob identities. Their dependency root must be an existing checkout with TypeScript installed. The route reproduction also needs @solidjs/router 2.0.0-next.16. Neither script changes a product checkout or contacts staging. Run the route script with REVIEW_DEPENDENCY_ROOT pointing at that checkout:

```sh
REVIEW_DEPENDENCY_ROOT=/path/to/pirate-web-solid node g3-rollback-privacy-reproducer-20261013.mjs
```

The privilege reproduction requires Docker and a new empty disposable local PostgreSQL container. Use the named, isolated container below; it publishes no port, has no external network, and keeps its data in tmpfs. Trust authentication is confined to this fixture, with no managed credentials. Wait for pg_isready to succeed before running the script. Do not point this script at staging or any existing database: it creates the synthetic roles, schema and functions used by the proof.

```sh
docker run --rm --detach --name telegram-g1-review-20261013-noinherit --network none --tmpfs /var/lib/postgresql/data:rw -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17.11
docker exec telegram-g1-review-20261013-noinherit pg_isready -U postgres
REVIEW_DEPENDENCY_ROOT=/path/to/pirate-web-solid node g1-owner-equivalence-reproducer-20261013.mjs
docker stop telegram-g1-review-20261013-noinherit
```

The runtime proof passed on PostgreSQL 17.11; the route proof passed with the installed pinned router and exact fetched modules. These are bounded reproductions, not a full product suite or deployed renderer. All thirteen hosted checks on PR605 were independently read as successful on its exact head. The audit JSON includes the exact proposed grant block and its digest, recomputed migration/body/ledger bindings, both reproduction results, changed source blobs, check runs, and byte-verified review and issue comments.

Cloud retains Telegram ownership and can implement both source repairs now. Actual staging grant application still requires explicit approval of the exact reviewed block and a fresh receipt binding the effective serving principal and Hyperdrive origin. R1, R2, C1 and E1 remain owner decision pending; provider acceptance requires the real phone probe and managed identity lookup before the source expires at 2026-10-17T00:00:00Z. No managed mutation, deploy or phone acceptance occurred in this review.

SHA256SUMS covers the four package files. It establishes their integrity at the publishing commit, not independent provenance; source blob identities, runnable results and published review links provide the separate bindings.
