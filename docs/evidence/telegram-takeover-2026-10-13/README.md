# Cloud-accessible Telegram audit, October 13, 2026

The workspace_owner asked for the complete local handoff to be accessible from the cloud container through one of the two product repositories. This export lives on `handoff/telegram-audit-20261013` in `pirate-social-club/pirate-web-solid`. It is an evidence publication. It does not accept the probe for main or establish a deployment.

Start with [the original handoff](takeover-20261013/HANDOFF.md). Its seventeen evidence files and SHA256SUMS are copied byte for byte from the sealed local package. [EXPORT-SHA256SUMS](EXPORT-SHA256SUMS) additionally binds all files in this export, including the historical practice evidence and portable control-plane proofs.

## Source and date corrections

The original handoff records the 05:07:56 UTC GitHub observation. Its statements that the local probe is unpublished describe that checkpoint. This branch now preserves exact probe commit `c584a347bce8481bbf0ab389ef3259059e11dd68` and its parents `95a6991d2e5e5e83618300174b6f1f0300783785` and `45d07cb25b3267ad16f158aa40eff7d11ad49c5e` as Git history. The evidence-only commit adds this directory on top of c584; it does not change the candidate's runtime files. The local main and cloud source branches remain unchanged.

The original handoff describes October 10 OAuth setup as supported by an archived public read. During export, that raw October 10 receipt could not be found. The authoritative task record attests that read, but the archived `public-provider-config-after-owner-done.json` is actually an October 9 observation showing OAuth disabled. Preserve that historical distinction. The fresh [October 13 public read](provider-public-config-20261013.json), at 05:23:22 UTC, independently returns HTTP 200 with `telegram_oauth=true`, `telegram_seamless_auth_enabled=true` and `telegram_auth=false`. It confirms current public setup; it does not retroactively create the missing October 10 receipt or prove a login.

The cloud PR snapshot is dated evidence. Refresh [PR 598](https://github.com/pirate-social-club/api-next/pull/598), main, reviews and check runs before relying on its ongoing status. Reported cloud test outcomes have not been rerun by the local coordinator.

## Evidence available here

The [redacted owner-phone trace](historical-practice/owner-run-trace.log) supports the October 8 complete lesson, timings and 8/10 first-try result. [Serving readback](historical-practice/serving-readback.json), both deployment receipts and [staging acceptance](historical-practice/staging-acceptance.json) support the later PR 590 release. [Phone acceptance pending](historical-practice/phone-acceptance-pending.json) records the revised ending and Resume boundary. These are historical staging observations, not current serving certification.

[Research review](research-review.json), [reviewed research](reviewed-research.md), [original probe readiness](probe-readiness-2026-10-10.json), the thirteen-file probe archive and historical probe gate logs supply the cited earlier checkpoint evidence. Original local paths and old transport status inside these sealed files are historical. The newer handoff explicitly supersedes them where supported.

The control plane is a separate local repository. Its research and owning-record commit SHAs cannot be fetched as product-repository commits. [control-git-object-proofs.json](control-git-object-proofs.json) supplies raw Git commit/tree objects plus file inclusion proofs for the exact reviewed research and all eight task snapshots. `verify-control-proofs.py` recomputes the Git object IDs and each tree-to-file binding. This verifies source bytes at the stated commits without exporting unrelated control-plane history. It does not establish a reviewer signature, certify the truth of a test log or import a complete control-plane Git history.

The published Git branch makes the exact probe commits inspectable through ordinary Git and GitHub. An original Radicle patch ID is a Radicle identifier, not a Git commit SHA or GitHub PR. Seed receipt and the failed CI lookup remain local tool observations attested in the task record; no separate raw transport logs are claimed.

## Fetch and verify from an existing cloud clone

These commands extract the evidence without switching the active cloud worktree:

```sh
git fetch origin refs/heads/handoff/telegram-audit-20261013
telegram_audit_dir="$(mktemp -d)"
git archive FETCH_HEAD docs/evidence/telegram-takeover-2026-10-13 | tar -x -C "$telegram_audit_dir"
cd "$telegram_audit_dir/docs/evidence/telegram-takeover-2026-10-13"
sha256sum -c EXPORT-SHA256SUMS
(cd takeover-20261013 && sha256sum -c SHA256SUMS)
python3 verify-control-proofs.py
```

From the product clone, inspect the candidate and its preserved scope:

```sh
git show -s --format='%H%n%T%n%P' c584a347bce8481bbf0ab389ef3259059e11dd68
git diff --name-only 45d07cb25b3267ad16f158aa40eff7d11ad49c5e c584a347bce8481bbf0ab389ef3259059e11dd68
git diff --exit-code 45d07cb25b3267ad16f158aa40eff7d11ad49c5e c584a347bce8481bbf0ab389ef3259059e11dd68 -- src/worker.ts src/worker.test.ts wrangler.jsonc worker-configuration.d.ts
```

The expected candidate tree is `fca5d088c1a83761768e140831faa624e7e87b97`; its parents are original probe first, accepted Solid main second. The name-only diff contains thirteen paths, and the protected-file diff is empty. Full local verify tested c584, not the evidence-only child commit. There is no claim of new hosted checks, exact-candidate independent review, main acceptance, staging custody, real OAuth phone proof or account recovery.

The original package and historical evidence remain unchanged locally. This export is a cloud-accessible audit copy with its own manifest; it is not the independent-volume preservation workflow and it transfers no shared resource custody.
