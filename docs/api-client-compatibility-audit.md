# Generated API-client compatibility audit

This audit compares the four generated clients pinned by the Solid application
at checkpoint `9ad7a9fe3e0ba9a152538ca375abc0a3566fc6c4`. It answers whether
the older aliases can be replaced by the existing 0.48 client without changing
the application contract. It does not authorize an import rewrite or removal
of provenance evidence.

## Pinned clients and consumers

| Alias | Version | Production files importing it | Disposition |
| --- | ---: | ---: | --- |
| `@pirate/api-client` | 0.25.0 | 15 | Blocked by moderation action v2 |
| `@pirate/api-client-community-route` | 0.13.0 | 3 | Compatible for current consumers |
| `@pirate/api-client-handle-sales` | 0.21.0 | 8 | Compatible for current consumers |
| `@pirate/api-client-happy-path` | 0.48.0 | 15 | Already the target |

The comparison used the generated `client.ts` and provenance files inside the
pinned tarballs. All operation and exported type names from 0.13, 0.21, and
0.25 still exist in 0.48. Name preservation alone is not the compatibility
proof: 122 declarations changed since 0.13, 66 since 0.21, and 65 since 0.25.

The compile proof in `tsconfig.api-client-compatibility.json` remaps the
community-route and handle-sales aliases to the pinned 0.48 package while
leaving the blocked primary alias on 0.25. The entire application compiles
under that mapping.

## Community-route result

The two consumed operations retain their method and path:

- `GET /c/:path_segment`
- `GET /communities/:communityId/preview`

The route-resolution input, response, and declared-error types are identical.
The preview input and declared errors are also identical. Its response has two
drifts in 0.48: `localized_text.items[].source_hash` is nullable, and
`altcha_pow` is no longer a membership gate type. The current consumers neither
require a non-null source hash nor branch on `altcha_pow`, and the remapped
application compile passes. This alias is compatible for its current consumer
surface.

## Handle-sales result

All input, response, and declared-error types are identical for every consumed
operation:

- `get_communitiesCommunityIdHandleOfferings`
- `get_publicPersonasPersonaId`
- `get_handleClaimsClaimId`
- `get_personas`
- `post_handleClaims`
- `post_handlePersonaLinkConfirmations`
- `post_handleQuotes`
- `post_handleReservations`

The HTTP methods and paths are unchanged, and the 0.48 request descriptors keep
ordinary JSON encoding. The remapped application compile passes. This alias is
compatible for its current consumer surface.

## Primary-client blocker

Remapping only `@pirate/api-client` from 0.25 to 0.48 fails in the post
engagement moderation surface. The operation
`post_moderationCasesCaseRefActions` changed protocol versions:

- The request now requires `version: "moderation-case-action-v2"` and
  `expected_case_revision`.
- Actions `approve`, `dismiss`, and `remove` were replaced by
  rating-specific approval, `dismiss_report`, `reject`, and rating-raise
  actions.
- The response now requires `version: "moderation-case-action-result-v2"`.
- The result status union replaces `removed` with `blocked`.
- The declared errors add `internal_error`.

The current post-engagement model constructs the old actions and old response
fixtures. Direct consolidation would therefore be a semantic product change,
not an alias cleanup. It would also expose that this comment-moderation path is
stale against the current backend contract.

Across `src`, 68 generated operation identifiers are referenced. Fifty-six
exist in both 0.25 and 0.48; every one of those retains its HTTP method, path,
and ordinary JSON request encoding. The primary-only compile reports no
incompatibility outside the moderation action model, so that protocol migration
is the explicit blocker to a full consolidation proof.

## Required sequence

First migrate post-engagement moderation to the v2 action contract with a real
case-revision source and updated UI semantics. Then rerun the all-alias remap
compile and the affected moderation tests. Only after that proof is green may a
separate implementation remove the three legacy aliases, their tarballs, and
their provenance entries. The existing provenance checker stays in force until
the rewrite lands and is reviewed.

## Verification commands

The passing safe-alias proof is:

```text
bun run tsc --noEmit -p tsconfig.api-client-compatibility.json
```

The ordinary provenance and application gates remain:

```text
node scripts/check-api-client-provenance.mjs
bun run tsc --noEmit -p tsconfig.json
```
