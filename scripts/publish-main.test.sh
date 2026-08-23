#!/usr/bin/env bash
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
publisher="$here/publish-main"
configurer="$here/configure-radicle-primary"
real_git=$(command -v git)
scratch=$(mktemp -d "${TMPDIR:-/tmp}/pirate-publish-main-test.XXXXXX")
trap 'rm -rf -- "$scratch"' EXIT

fail() {
  printf 'publish-main.test: %s\n' "$*" >&2
  exit 1
}

remote_head() {
  "$real_git" ls-remote "$1" refs/heads/main | awk '{print $1}'
}

make_fixture() {
  local name=$1
  fixture_root="$scratch/$name"
  fixture_origin="$fixture_root/origin.git"
  fixture_rad="$fixture_root/rad.git"
  fixture_work="$fixture_root/work"
  fixture_log="$fixture_root/events.log"
  fixture_git="$fixture_root/git"
  fixture_rad_bin="$fixture_root/rad"

  mkdir -p "$fixture_root"
  "$real_git" init --bare --quiet "$fixture_origin"
  "$real_git" init --bare --quiet "$fixture_rad"
  "$real_git" -C "$fixture_rad" config receive.advertisePushOptions true
  "$real_git" init --quiet --initial-branch=main "$fixture_work"
  "$real_git" -C "$fixture_work" config user.name workspace_operator
  "$real_git" -C "$fixture_work" config user.email workspace_operator@users.noreply.github.com
  printf '%s\n' initial >"$fixture_work/state.txt"
  "$real_git" -C "$fixture_work" add state.txt
  "$real_git" -C "$fixture_work" commit --quiet -m 'test: initial state'
  fixture_initial=$("$real_git" -C "$fixture_work" rev-parse HEAD)
  "$real_git" -C "$fixture_work" remote add origin "$fixture_origin"
  "$real_git" -C "$fixture_work" remote add rad "$fixture_rad"
  "$real_git" -C "$fixture_work" push --quiet origin main
  "$real_git" -C "$fixture_work" push --quiet -o sync rad main
  "$real_git" -C "$fixture_origin" symbolic-ref HEAD refs/heads/main
  "$real_git" -C "$fixture_rad" symbolic-ref HEAD refs/heads/main
  printf '%s\n' target >>"$fixture_work/state.txt"
  "$real_git" -C "$fixture_work" add state.txt
  "$real_git" -C "$fixture_work" commit --quiet -m 'test: target state'
  fixture_target=$("$real_git" -C "$fixture_work" rev-parse HEAD)
  "$real_git" -C "$fixture_work" config --replace-all remote.origin.pushurl no-push

  cat >"$fixture_git" <<'FAKE_GIT'
#!/usr/bin/env bash
set -euo pipefail
{
  printf 'git'
  printf ' %q' "$@"
  printf '\n'
} >>"$EVENT_LOG"
if [[ ${FAIL_RAD_PUSH:-0} == 1 && ${1:-} == push && ${4:-} == rad ]]; then
  exit 75
fi
exec "$REAL_GIT" "$@"
FAKE_GIT

  cat >"$fixture_rad_bin" <<'FAKE_RAD'
#!/usr/bin/env bash
set -euo pipefail
{
  printf 'rad'
  printf ' %q' "$@"
  printf '\n'
} >>"$EVENT_LOG"
FAKE_RAD
  chmod +x "$fixture_git" "$fixture_rad_bin"
  : >"$fixture_log"
}

run_publisher() {
  (
    cd "$fixture_work"
    env \
      EVENT_LOG="$fixture_log" \
      REAL_GIT="$real_git" \
      PUBLISH_MAIN_GIT="$fixture_git" \
      PUBLISH_MAIN_RAD="$fixture_rad_bin" \
      PUBLISH_MAIN_ORIGIN_URL="$fixture_origin" \
      PUBLISH_MAIN_RAD_URL="$fixture_rad" \
      PUBLISH_MAIN_SEED=test-seed \
      FAIL_RAD_PUSH="${FAIL_RAD_PUSH:-0}" \
      "$publisher" "$@"
  )
}

run_configurer() {
  (
    cd "$fixture_work"
    env \
      EVENT_LOG="$fixture_log" \
      REAL_GIT="$real_git" \
      PUBLISH_MAIN_GIT="$fixture_git" \
      PUBLISH_MAIN_ORIGIN_URL="$fixture_origin" \
      PUBLISH_MAIN_RAD_URL="$fixture_rad" \
      "$configurer" "$@"
  )
}

expect_failure() {
  if "$@" >"$fixture_root/failure.out" 2>"$fixture_root/failure.err"; then
    fail "command unexpectedly succeeded: $*"
  fi
}

make_fixture dry-run
run_publisher --sha "$fixture_target" --dry-run >/dev/null
[[ $(remote_head "$fixture_rad") == "$fixture_initial" ]] || fail 'dry run changed Radicle'
[[ $(remote_head "$fixture_origin") == "$fixture_initial" ]] || fail 'dry run changed GitHub'
! grep -Eq '^(git push|rad sync)' "$fixture_log" || fail 'dry run invoked a mutating command'

make_fixture ordered
run_publisher --sha "$fixture_target" --execute >/dev/null
[[ $(remote_head "$fixture_rad") == "$fixture_target" ]] || fail 'Radicle missed target'
[[ $(remote_head "$fixture_origin") == "$fixture_target" ]] || fail 'GitHub missed target'
rad_push_line=$(grep -nF "git push -o sync rad $fixture_target:refs/heads/main" "$fixture_log" | cut -d: -f1)
sync_line=$(grep -nF 'rad sync --seed test-seed' "$fixture_log" | cut -d: -f1)
origin_push_line=$(grep -nF "git push $fixture_origin $fixture_target:refs/heads/main" "$fixture_log" | cut -d: -f1)
[[ $rad_push_line -lt $sync_line && $sync_line -lt $origin_push_line ]] ||
  fail 'publication order was not Radicle push, seed sync, GitHub mirror'

make_fixture recovery
"$real_git" -C "$fixture_work" push --quiet -o sync rad "$fixture_target:refs/heads/main"
: >"$fixture_log"
run_publisher --sha "$fixture_target" --execute >/dev/null
! grep -Fq "git push -o sync rad $fixture_target:refs/heads/main" "$fixture_log" ||
  fail 'recovery redundantly pushed an already-current Radicle main'
sync_line=$(grep -nF 'rad sync --seed test-seed' "$fixture_log" | cut -d: -f1)
origin_push_line=$(grep -nF "git push $fixture_origin $fixture_target:refs/heads/main" "$fixture_log" | cut -d: -f1)
[[ $sync_line -lt $origin_push_line ]] || fail 'recovery mirrored before seed synchronization'

make_fixture rad-failure
FAIL_RAD_PUSH=1 expect_failure run_publisher --sha "$fixture_target" --execute
[[ $(remote_head "$fixture_origin") == "$fixture_initial" ]] || fail 'GitHub changed after Radicle push failure'
! grep -Fq 'rad sync' "$fixture_log" || fail 'seed sync ran after Radicle push failure'

make_fixture dirty
printf '%s\n' dirty >>"$fixture_work/state.txt"
expect_failure run_publisher --sha "$fixture_target" --execute
! grep -Eq '^(git push|rad sync)' "$fixture_log" || fail 'dirty checkout reached a mutation'

make_fixture branch
"$real_git" -C "$fixture_work" switch --quiet -c topic
expect_failure run_publisher --sha "$fixture_target" --execute
! grep -Eq '^(git push|rad sync)' "$fixture_log" || fail 'non-main checkout reached a mutation'

make_fixture exact-sha
expect_failure run_publisher --sha "$fixture_initial" --execute
! grep -Eq '^(git push|rad sync)' "$fixture_log" || fail 'wrong exact SHA reached a mutation'

make_fixture guard
"$real_git" -C "$fixture_work" config --unset-all remote.origin.pushurl
expect_failure run_publisher --sha "$fixture_target" --execute
expect_failure run_configurer --check
run_configurer --apply >/dev/null
[[ $("$real_git" -C "$fixture_work" config --get-all remote.origin.pushurl) == no-push ]] ||
  fail 'configurer did not install the no-push guard'
expect_failure "$real_git" -C "$fixture_work" push origin "$fixture_target:refs/heads/main"
[[ $(remote_head "$fixture_origin") == "$fixture_initial" ]] ||
  fail 'ordinary origin push bypassed the no-push guard'

make_fixture remote
"$real_git" -C "$fixture_work" remote set-url origin "$fixture_root/unexpected.git"
expect_failure run_publisher --sha "$fixture_target" --execute
! grep -Eq '^(git push|rad sync)' "$fixture_log" || fail 'unexpected remote reached a mutation'

make_fixture non-fast-forward
"$real_git" clone --quiet "$fixture_origin" "$fixture_root/other"
"$real_git" -C "$fixture_root/other" config user.name integration_owner
"$real_git" -C "$fixture_root/other" config user.email integration_owner@users.noreply.github.com
printf '%s\n' divergent >>"$fixture_root/other/state.txt"
"$real_git" -C "$fixture_root/other" add state.txt
"$real_git" -C "$fixture_root/other" commit --quiet -m 'test: divergent state'
"$real_git" -C "$fixture_root/other" push --quiet origin main
expect_failure run_publisher --sha "$fixture_target" --execute
[[ $(remote_head "$fixture_rad") == "$fixture_initial" ]] || fail 'non-fast-forward check changed Radicle'

printf '%s\n' 'publish-main.test: all cases passed'
