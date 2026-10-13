# Telegram staging workstation run sheet, 2026-10-13

Status: operator packet for cloud review and execution handover. This document is data. Publishing it runs no staging command. No migration, grant, deployment, reset or phone acceptance is claimed.

The cloud_telegram_coordinator retains the full task. The local coordinator accepts bounded workstation execution once the cloud records the current source composition and exclusive release/resource custody. The workstation already has Infisical, Bun, SSH and a project-local Wrangler. Its product checkouts are older than these pins; reconcile them through the maintained workspace/worktree process before execution. Do not replace, reset or build in another writer's checkout.

The [standing owner direction](https://github.com/pirate-social-club/api-next/issues/595#issuecomment-6151444309) authorizes necessary Telegram staging work and the exact incremental grant below. It removes repeated owner permission questions. Independent review, required checks, existing managed access, exact source/artifact/config/serving binding, fresh readiness, custody and bounded recovery remain technical requirements. Unrelated production, rewards/funds, new credentials, irreversible resets and excluded release effects remain outside this packet.

The active probe expires at 2026-10-17T00:00:00Z. An expiry requires a reviewed source successor; time passing does not extend it.

## Frozen inputs

| Input | Exact identity |
| --- | --- |
| API accepted source and tooling | b8efd833af7e9729c1e988f81aa8804776cf74fe |
| Solid accepted main for Part A | f668c090e00b1a5792406075476620aad49f8890 |
| Corrected prepared Solid recovery | 4fdcdb550577c379b9e50ad91ad47c02eeffa82f, tree 2e55eeacb73185f2c9a4a8c404782bd65ef66590 |
| Contract draft reviewed here | 153658a4ead7ad1f4bc26a63fc46a249f75177d6 |
| Incremental grant template, trimmed UTF-8 | SHA256 474d70e56baef8874150f509c40207957affc10682934270c49e9d784604f814 |
| Migration 0265 | SHA256 337b5469bdf01595413349517f1c0750530280a4a38ac8fd007a2d2e3c4e106f |
| Staging CONTROL_PLANE candidate Hyperdrive | 8cb7658a0f7143359c1becfec6a15c23 |

These are dated source observations, not serving receipts. API605 has thirteen successful checks at its reviewed head and its squash tree matches. Contract604 has thirteen successful checks on 153658a4 and [final source review](https://github.com/pirate-social-club/api-next/pull/604#pullrequestreview-5507879288). The corrected recovery has [independent source review](https://github.com/pirate-social-club/api-next/issues/595#issuecomment-6151569798), with cloud-reported full suites/build/fingerprint. If actually used for recovery, it still needs the normal revert PR and applicable exact-head checks.

If published main moves, stop and record a reviewed successor or prove the intended older API source remains accepted and use admitted exact-source tooling. The Solid guard requires its HEAD to be current published main; do not waive that check or silently deploy a newer whole release.

## Operator preparation and receipts

Use Bash for the commands below. Set the three paths to existing admitted, exclusively handed-over repositories and a named external evidence directory. Do not place evidence, dependency links or scripts loose in the staging root.

```bash
set -euo pipefail
umask 077
export TELEGRAM_API=/absolute/admitted/api-next
export TELEGRAM_SOLID=/absolute/admitted/pirate-web-solid
export TELEGRAM_EVID=/absolute/named/telegram-staging-execution-20261013
mkdir -p "$TELEGRAM_EVID/before" "$TELEGRAM_EVID/after"
TELEGRAM_OP=(infisical run
  --projectId=fac45f92-9450-42fb-8c2f-f20d043fdfab
  --env=staging
  --path=/services/api-next
  --path=/services/api-next/operator
  --silent --)
```

Use existing managed credentials in child-process environment only. Never print, copy into a document, hash or pass a connection URL/password/token as a CLI argument. Do not enable shell tracing. Keep raw version/config/instance outputs private; publish only sanitized identity, allocation, digests, flags, results and timestamps, without author names, cookies, callbacks, browser tokens, learner data or secrets.

Before any mutation, record the named operator role and cloud handover covering HTTP, jobs, media, Solid, the staging database and their shared resource/binding configuration. Verify that no other release writer is active. The local coordinator is the workstation operator; the owner does not need to find an unspecified replacement.

Record clean source, exact HEAD, origin, accepted-main reachability, required CI/review and actual package/CLI versions. Use the installed lockfile version. API preview and deployment must read the same effective provider credential: the maintained wrapper deliberately removes the ambient CLOUDFLARE_API_TOKEN from its Wrangler child. Do not compare a different credential's readback with that wrapper's deployment. Solid's guard uses its own maintained credential selection; bind that identity too.

Collect the latest deployment allocation and the metadata for every version receiving traffic, not just the newest uploaded version. The project-local CLI supports these read-only commands:

```bash
cd "$TELEGRAM_API"
bunx wrangler deployments list --env staging --config apps/http-worker/wrangler.jsonc --json
bunx wrangler deployments list --env staging --config apps/jobs-worker/wrangler.jsonc --json
bunx wrangler deployments list --env staging --config apps/media-processor-worker/wrangler.jsonc --json
# Repeat for every version in each current allocation, with the matching config:
bunx wrangler versions view VERIFIED_VERSION_ID --env staging --config apps/http-worker/wrangler.jsonc --json
```

Repeat the allocation after metadata collection to refuse movement. Bind each effective CONTROL_PLANE selection to the Hyperdrive origin and the actual database/login used by the serving URL. Source config, an admin URL or an example role name alone does not establish this. The prior managed read bound PlanetScale staging/main to origin aws-us-east-1-4.pg.psdb.cloud, database postgres, but did not prove current serving-version/principal binding.

The last known ledger is the exact 246-entry prefix ending 0246_telegram_restricted_learners.sql. Obtain a fresh explicit READ ONLY transaction against the verified staging target, retain ordered version/checksum rows and roll back. Compare every row with the pinned source. Unknown versions, mismatched applied checksums, a changed target or a nonprefix refuse execution. A changed but valid prefix requires a refreshed bounded plan, not blind replay.

## Part A: Solid-only probe release

Part A does not depend on the API migration or recovery endpoints. It reads the Solid Worker's existing public verification configuration. Before mutation, bind the currently serving Solid source/version/allocation, the managed app/provider configuration and origin, and its compatibility with the current API. Keep a sanitized before receipt.

Record the compatible predecessor and G3 recovery path. The old candidate bd319b43 is held and must not be used. The corrected candidate removes the probe while preserving existing Telegram-link alias privacy and PR65. If the actual predecessor differs, review compatibility before deployment. A previous-tree resemblance or version annotation alone is not enough.

Run from the clean, exclusively handed-over Solid main checkout matching the current published main:

```bash
cd "$TELEGRAM_SOLID"
test "$(git branch --show-current)" = main
test "$(git rev-parse HEAD)" = f668c090e00b1a5792406075476620aad49f8890
test -z "$(git status --porcelain)"
bun run check:staging:hns-route 2>&1 | tee "$TELEGRAM_EVID/before/solid-hns-check.txt"
bun run deploy:staging:hns-guarded 2>&1 | tee "$TELEGRAM_EVID/after/solid-deploy.txt"
```

The maintained guard builds for staging, checks source and built ingress fingerprints against the active gateway, performs its packaging check, rechecks the gateway before deploy, then runs the live serving and browser checks. It includes the managed read-only browser credential injection. Do not substitute a direct Wrangler deploy or a different browser build.

Retain the build/artifact hashes, ingress fingerprint, new version ID, complete after allocation, source/config/app binding and public/private route checks. A build receipt proves packaging; a version receipt proves upload identity; the current allocation and live checks establish serving. Confirm the probe is available only on the intended staging origin and existing-link canonical/alias requests remain private.

Then coordinate the phone probe: the participant performs login on the real phone before expiry. The operator uses the managed read-only identity lookup to bind the fresh numeric Telegram ID, provider subject, login freshness, nonce/navigation/browser context and consented target. Keep only the sanitized result. Do not publish raw callback parameters or tokens. Success selects Privy subject to the reviewed provider contract; failure opens native OIDC investigation under the same proof requirements. Do not fabricate provider acceptance from a desktop build.

## Part B: exact staging database upgrade

Part B is a separate gate and may proceed alongside Part A only with nonconflicting exclusive resource custody. Pin the API tree to b8efd833af7e9729c1e988f81aa8804776cf74fe. The reviewed intended delta from the actual 0246 predecessor is nineteen migrations:

| Migration | SHA256 |
| --- | --- |
| 0247_karaoke_instrumental_qualification_policy.sql | ea353c0d863a2532c47e793c7cb46b5104ba474ae92924d0b406ad73fb216258 |
| 0248_guest_learning_authority_foundation.sql | 2c99571cedbe0640733b3509c657e81d4a89f505ba6d3fed61ea7e0c4befaed1 |
| 0249_study_participation_owner_preservation.sql | 8c3578dcbbbdf929fb412e4493e6e16ab5d2af0fe13d518bd3f582892cd0c732 |
| 0250_guest_browser_authority_transitions.sql | c025474320a4bc244d974929415fed95ad26b22d0e2cf9657fbd2f328ddafcf9 |
| 0251_guest_learning_resource_reservations.sql | 2de6e6508ec498a616b2db85ceafef1e2dbde7323a060cfae9956d0353d1aae4 |
| 0252_guest_learning_controlled_row_admission.sql | fc49e0678b1a14430455b29c9f1079c10fe8ee6408724edcbad110cd22b9ea7f |
| 0253_learner_audio_deletion_fence.sql | 27ce4e1c6e3185badb27e23bad96b84a3c9c5a226c7678d736d05072138f6cdb |
| 0254_guest_prepared_study_session_capture.sql | 2c5d3a799eba282ce4c4993f70f86276372424b8dfcc2946a0dfee457c1b2ad3 |
| 0255_guest_spoken_success_checkpoints.sql | fb7e3519edf7df95ef8071aaeced8d22509c146edce2f2d0b85d146b06051a2b |
| 0256_guest_owned_study_mutations.sql | bb90ea35b74aa8fddfb206aad1ce8ddb439ba53ae5175de7a33fd2c7102684ce |
| 0257_guest_spoken_audio_archive.sql | 3c5eb872e14558e28f78e607012d498f6fb7c2e8bae05bbba8911fd2ad9bcfec |
| 0258_guest_recovery_audio_deletion.sql | cc9792c45c8938b89025a3e723e58f01f021d93d11b426c7600cfcf677bf9aef |
| 0259_guest_captured_recovery_reads.sql | 3b84f8f3798e777bd7aa674363add62854d330b9ef12079fa49e2f2b24ea0dc9 |
| 0260_owner_study_original_source_reads.sql | efe82c3b3c132217bc6c01f2b73fef5f7940465d9c08ab18c0bcbaeb3b897120 |
| 0261_guest_study_resource_expiry.sql | e782d6dc574052f30418d54332087715d2e1ec279543e5f6a8be5c4ffbc4960c |
| 0262_ordinary_audio_producer_capture.sql | e266708eae7b1d954421adc8b322ec51103f50506c42da91c22120f57bbcb485 |
| 0263_guest_ephemeral_audio_cleanup.sql | 3b0c0da63baacda30b5a450052bb3f1842ec73b8a68011a2674b969f3fc37d55 |
| 0264_legacy_learner_audio_producer_disposition.sql | 04a395bef0a06e3a405387123ec85ccdd3f4503b202cb365154375e6d7186097 |
| 0265_account_karaoke_unclaimed_cancellation.sql | 337b5469bdf01595413349517f1c0750530280a4a38ac8fd007a2d2e3c4e106f |

From the exact API checkout, the maintained dry run verifies every source migration/checksum and opens no database connection:

```bash
cd "$TELEGRAM_API"
test "$(git rev-parse HEAD)" = b8efd833af7e9729c1e988f81aa8804776cf74fe
test -z "$(git status --porcelain)"
bun run db:migrate --dry-run 2>&1 | tee "$TELEGRAM_EVID/before/migration-plan.txt"
```

After the fresh target and exact prefix comparison, execute the maintained migrator under existing admin credential injection:

```bash
cd "$TELEGRAM_API"
"${TELEGRAM_OP[@]}" bun run db:migrate 2>&1 | tee "$TELEGRAM_EVID/after/migrations.txt"
```

The source loader verifies the complete immutable manifest. The transaction checks the existing ledger prefix and checksums and applies missing entries in order. The CLI accepts only --dry-run; do not invent an --expected-ledger flag. The exported runPostgresMigrations API accepts an exact expectedLedger for a separately reviewed operator adapter if the execution ceremony requires the exact 0246 precondition in the apply transaction. The plain CLI relies on fresh verified prefix, immutable source and exclusive schema custody; use a reviewed adapter rather than pretending the CLI supplies that stronger race check.

Reread the full ledger in a READ ONLY transaction and require all 265 identities to match. Preserve prior applied bytes. If an apply or COMMIT outcome is uncertain, inspect the actual ledger before retry; do not rewrite or drop schema. Keep current and historical learner producers fenced where terminal evidence is unavailable. This packet does not run a legacy settlement/reset ceremony.

## Exact incremental grant

Apply only the reviewed ordinary-account EXECUTE section. It creates no roles, grants no table permissions or memberships, and leaves the generic upload closure, legacy/operator settlement and guest authority locked. All 147 required denials must remain effective. Existing guest authority is not activated by this packet; record guest configuration and any prerequisite restricted-role readiness separately without borrowing admin authority.

First observe current_user through each actual serving connection and prove the effective HTTP/jobs principal mapping. If their effective principals differ, stop for a reviewed exact per-principal application plan. Before the grant, inspect all 170 function facts through the serving connection. Missing new functions, unexpected owners/search paths, owner membership or any effective denied EXECUTE are blocking; anticipated missing required grants are the reason for the incremental step.

The following local renderer extracts only the approved block, verifies its exact hash and emits a schema-qualified transaction for the verified serving role. It writes a SQL data file and does not connect to any database. Set TELEGRAM_SERVING_ROLE to the observed role name, not to the example api_next_app unless that actually is the serving role.

```bash
export TELEGRAM_SERVING_ROLE=VERIFIED_SERVING_ROLE
cd "$TELEGRAM_API"
python3 - <<'PY'
import os, pathlib, re, hashlib
source = pathlib.Path("db/postgres/roles.sql.example").read_text()
start = "-- Ordinary account function grants begin\n"
end = "\n-- Ordinary account function grants end"
if source.count(start) != 1 or source.count(end) != 1:
    raise SystemExit("grant markers differ")
block = source.split(start, 1)[1].split(end, 1)[0].strip()
if hashlib.sha256(block.encode()).hexdigest() != "474d70e56baef8874150f509c40207957affc10682934270c49e9d784604f814":
    raise SystemExit("grant block hash differs")
role = os.environ["TELEGRAM_SERVING_ROLE"]
if not role or role == "VERIFIED_SERVING_ROLE" or any(ord(c) < 32 for c in role):
    raise SystemExit("verified serving role is required")
statements = re.findall(r"GRANT EXECUTE ON FUNCTION ([a-z_0-9]+)\(([\s\S]*?)\) TO api_next_app;", block)
if len(statements) != 23 or len(re.findall(r"GRANT EXECUTE ON FUNCTION", block)) != 23:
    raise SystemExit("grant set differs")
quoted_role = '"' + role.replace('"', '""') + '"'
rendered = ["BEGIN;", "SET LOCAL search_path TO pg_catalog, api_next, pg_temp;"]
for name, args in statements:
    rendered.append('GRANT EXECUTE ON FUNCTION "api_next"."'+name+'"('+args+') TO '+quoted_role+';')
rendered.append("COMMIT;")
path = pathlib.Path(os.environ["TELEGRAM_EVID"]) / "ordinary-account-grants.sql"
with path.open("x") as out:
    out.write("\n".join(rendered)+"\n")
print("Prepared 23 schema-qualified EXECUTE grants; no database operation.")
PY
```

Review the rendered role, schema and exact twenty-three signatures against the source grant list and the serving binding receipt. The only permitted transformation is schema qualification and SQL-quoted replacement of the grantee with the verified serving principal. Keep its SHA256 and target receipt. The template hash binds the reviewed grant set; it is not the rendered file's hash.

Execute that SQL transaction through the established managed staging administrator connection and its normal operator SQL runner. Do not pass a password-bearing URL on a command line or execute roles.sql.example. The precise local runner and target are bound in the workstation handover; this packet does not guess an absent runner or export credentials. Require a positive commit receipt. On an uncertain outcome, collect fresh privileges before deciding on a retry.

Then verify through the same actual serving connection:

```bash
cd "$TELEGRAM_API"
"${TELEGRAM_OP[@]}" bun run db:preflight:serving-functions 2>&1 | tee "$TELEGRAM_EVID/after/serving-functions.txt"
"${TELEGRAM_OP[@]}" bun run db:preflight:telegram-activation 2>&1 | tee "$TELEGRAM_EVID/after/telegram-activation.txt"
"${TELEGRAM_OP[@]}" bun run db:preflight:reward-activation 2>&1 | tee "$TELEGRAM_EVID/after/runtime-role-and-ledger.txt"
```

These are read-only readiness checks, not feature activation. The last command verifies the pinned main ledger and existing runtime permission contract; it does not enable rewards. The serving-functions check enforces twenty-three grants, 147 denials, schema/owner, SECURITY DEFINER/search-path pins and refusal of direct or indirect owner membership. Save full sanitized before/after facts in addition to the summary. Refusal is a concrete source/role readiness finding for cloud to resolve under scope, not another broad owner approval request.

## Workers and media compatibility

Before the worker release, check the jobs alignment-alert cursor and its effective permissions using the maintained [alignment-alert runbook](https://github.com/pirate-social-club/api-next/blob/b8efd833af7e9729c1e988f81aa8804776cf74fe/docs/runbooks/media-alignment-alert-deploy.md). Retain current cursor progress. Do not reset it or grant a whole schema because a preflight fails.

Collect binding previews for all three candidates, using the maintained tool and the same effective deployment credential:

```bash
cd "$TELEGRAM_API"
"${TELEGRAM_OP[@]}" bun run check:staging:bindings --config apps/http-worker/wrangler.jsonc --env staging --source-ref b8efd833af7e9729c1e988f81aa8804776cf74fe
"${TELEGRAM_OP[@]}" bun run check:staging:bindings --config apps/jobs-worker/wrangler.jsonc --env staging --source-ref b8efd833af7e9729c1e988f81aa8804776cf74fe
"${TELEGRAM_OP[@]}" bun run check:staging:bindings --config apps/media-processor-worker/wrangler.jsonc --env staging --source-ref b8efd833af7e9729c1e988f81aa8804776cf74fe
```

An unexplained flag, binding, namespace, runtime or source drift refuses deployment. An intentional difference requires the exact fresh coordinator-reviewed drift receipt described in the [binding contract](https://github.com/pirate-social-club/api-next/blob/b8efd833af7e9729c1e988f81aa8804776cf74fe/docs/staging-serving-binding-drift.md), including every change and allocation and an expiry at most thirty minutes away. The wrapper preserves the identical TELEGRAM_CONFIG_JSON from every serving HTTP/jobs version; jobs must not enable linking. Do not accidentally restore checked-in disabled defaults or change flags through a documentation template.

G2 retains the compatible media processor in Part B. Its source reads the vocal stem and records alignment provenance. Before any Part B deployment, paginate and describe each active media-processing and video-analysis instance; retain queued, running, waiting/retrying and relevant paused/error states, the bound Workflow version and exact alignment progress. The CLI list status filters are queued, running, paused, errored, terminated and complete; waiting/retrying must be resolved from descriptions, not invented list filters.

```bash
cd "$TELEGRAM_API"
bunx wrangler workflows instances list pirate-media-processing-staging --env staging --config apps/media-processor-worker/wrangler.jsonc --page 1 --per-page 100
bunx wrangler workflows instances list pirate-video-analysis-staging --env staging --config apps/media-processor-worker/wrangler.jsonc --page 1 --per-page 100
# Repeat all pages, then describe every relevant instance:
bunx wrangler workflows instances describe pirate-media-processing-staging VERIFIED_INSTANCE_ID --env staging --config apps/media-processor-worker/wrangler.jsonc --step-output=false
```

Counts alone do not prove compatibility. Proceed only if no instance has an alignment step pending, or if an independently reviewed bounded drain/version-compatibility condition covers each affected instance and the release. Do not terminate or reset instances. No claim is made that an old running instance automatically acquires new code. Reread the condition immediately before deploy; custody must cover actors that can create new instances during this check.

After all gates, deploy HTTP, then jobs, then the media processor, using the maintained provenance wrappers:

```bash
cd "$TELEGRAM_API"
"${TELEGRAM_OP[@]}" bun run deploy:worker --config apps/http-worker/wrangler.jsonc --env staging --source-ref b8efd833af7e9729c1e988f81aa8804776cf74fe 2>&1 | tee "$TELEGRAM_EVID/after/http-deploy.txt"
"${TELEGRAM_OP[@]}" bun run deploy:worker --config apps/jobs-worker/wrangler.jsonc --env staging --source-ref b8efd833af7e9729c1e988f81aa8804776cf74fe 2>&1 | tee "$TELEGRAM_EVID/after/jobs-deploy.txt"
"${TELEGRAM_OP[@]}" bun run deploy:worker --config apps/media-processor-worker/wrangler.jsonc --env staging --source-ref b8efd833af7e9729c1e988f81aa8804776cf74fe 2>&1 | tee "$TELEGRAM_EVID/after/media-deploy.txt"
```

The wrappers refuse source drift and role/binding failures before upload. HTTP also runs the live HNS/Solid route check afterward. A post-upload check failure can mean the new Worker is already serving; collect the actual allocation before recovery. Do not treat a nonzero exit as proof of no mutation.

Repeat all allocations, effective metadata/Hyperdrive bindings, privilege and ledger checks, HNS/browser checks and per-instance version/alignment observations. Tie each deploy receipt to the source, config, version ID, actual traffic allocation and retained artifact/build identity. No version-list-only receipt proves serving. Do not publish sensitive raw logs.

## Acceptance, recovery and handback

Run the real-phone Telegram practice journey against the composed serving API/Solid versions: start without sign-in, answer a complete lesson, check feedback/prompt ordering and exact replied-to prompt, retry/Resume, completion actions and learner isolation. Record the accepted update and confirmed sends with sanitized timestamps and outcomes. The old October8 trace covers its historical serving source only; it is not acceptance of this release.

Provider evidence decides the open section of contract604. R1 limited practice access, R2 practice-only, C1 private read-only history retaining the bot profile and E1 Open my progress are already selected under delegation. Implement and accept recovery/Connect under the reviewed spec successor; do not silently claim those features exist after the probe-only release.

G3 recovery removes the probe through the corrected normal revert PR and guarded published-main release. Do not use held bd319b43 or a direct provider rollback. API/database recovery is a separately reviewed compatible source-forward plan: retaining nineteen applied migrations and the approved grants is not a reason to send old unreviewed code back into traffic. There is no automatic schema downgrade, producer closure, bucket cleanup or grant revocation in this packet. Bind the source-forward recovery and the current before state in the execution handover before Part B.

Close each part with sanitized source/artifact/config/app and serving allocations, exact ledger and role facts, gateway/browser results, retained Workflow observations, phone/provider evidence or an explicit unresolved physical dependency, and the named custody handback. No complete-task claim is made while provider acceptance or the reviewed recovery/Connect implementation and final composed phone journey remain open.

## Sources and verification limits

Commands were checked against the exact source wrappers, package scripts and project-local Wrangler help. No command in this document was run against staging. The grant renderer is a local data-only preparation step; its extraction/hash/signature count and SQL identifier quoting are checked separately before publication. The execution handover must bind the actual managed SQL runner.

The maintained source is [API deploy wrapper](https://github.com/pirate-social-club/api-next/blob/b8efd833af7e9729c1e988f81aa8804776cf74fe/scripts/deploy-worker-with-provenance.ts), [migration runner](https://github.com/pirate-social-club/api-next/blob/b8efd833af7e9729c1e988f81aa8804776cf74fe/scripts/postgres-migrations.ts), [serving-function guard](https://github.com/pirate-social-club/api-next/blob/b8efd833af7e9729c1e988f81aa8804776cf74fe/scripts/serving-function-privileges-preflight.ts), [exact grant example](https://github.com/pirate-social-club/api-next/blob/b8efd833af7e9729c1e988f81aa8804776cf74fe/db/postgres/roles.sql.example) and [Solid guarded staging release](https://github.com/pirate-social-club/pirate-web-solid/blob/f668c090e00b1a5792406075476620aad49f8890/scripts/deploy-staging-with-hns-guard.mjs). Platform readback/instance semantics are documented in [Workers commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/) and [Workflow inspection](https://developers.cloudflare.com/workflows/get-started/guide/).

Cloud reported automatic permission review rejecting its local document-builder. The exact rejection and attempted command were not supplied, so the stated likely reason is unverified. This plain Markdown publication is a separate documentation operation; it neither executes the embedded commands nor disables, obscures or changes that permission check. Retain the rejection receipt if available.
