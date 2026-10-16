# Start the existing song status source tranche

The shared-file hold is RELEASED. Continue in the SAME existing isolated cloud Paper writer associated with phone close-controls PR94. This is a follow-up source tranche, not a new agent, coordinator or competing writer. The owner-adopted design and the rollout coordinator's explicit source handback supply authority; no renewed design or execution permission is needed.

## Existing writer refresh received

The [existing cloud writer receipt](https://github.com/pirate-social-club/pirate-web-solid/pull/94#issuecomment-6224119132), posted at 2026-10-16 20:30 UTC, confirms base and checked-out HEAD `b542afb15cb2ac2df9138cd38607f6c5a745b9af` on `fix/paper-song-status-detail-20261017`, frozen install completed, and phone head `4b5b74532114d27c798bab56951adf7e4b95c69b` preserved. The writer reports a separate cloud worktree within the same session and is continuing implementation. The coordinator independently read the receipt and verified the phone PR head, without inspecting the remote filesystem. See [REFRESH-RECEIPT.json](REFRESH-RECEIPT.json). Do not create another writer or repeat the completed refresh merely because this document retains its startup instructions.

## Accepted source and custody evidence

Use exact accepted Solid main `b542afb15cb2ac2df9138cd38607f6c5a745b9af`, the [normal protected PR93 merge](https://github.com/pirate-social-club/pirate-web-solid/pull/93). Its tree exactly equals reviewed `b42ccbc801c73c7ecb49326d91b26f3fb2825e6b`: `1e778ec0ddb16d4b3b50889bf608ac0e90f88612`. All 30 paths match manifest SHA256 `2461d61e3c83e7f25a82dffa87305bb61740fbfa68948a32c44924e6b1f88c4d`. Separate review returned ACCEPT_FOR_PROTECTED_SOURCE_INTEGRATION, and all 27 local maintained commands plus required hosted verify, Storybook audit and Solid Doctor PR passed. The coordinator explicitly returned source custody at 2026-10-16 20:23 UTC. [STATE.json](STATE.json) carries the cloud-readable summary.

The high unpatched braces advisory is still open under the reviewer's limited source-integration disposition. It is not audit-green. API622 is source-accepted, but API runtime, migrations and paired Activity runtime remain held; none is a prerequisite for this source tranche.

## Refresh the same writer and preserve the phone work

First finish any currently running phone-tranche processes and preserve its committed source/evidence. Keep PR94 at `4b5b74532114d27c798bab56951adf7e4b95c69b` for its separate independent review. Do not overwrite, reset, clean away, rebase or amend that work as part of this handback.

In that same cloud writer's checkout, once its working tree is clean, fetch main and create the song-status branch from the exact accepted commit. The existing writer has already reported this refresh in the receipt above. The commands below preserve the exact startup procedure; the coordinator did not execute them remotely.

```sh
git status --short
git fetch origin main
git merge-base --is-ancestor b542afb15cb2ac2df9138cd38607f6c5a745b9af FETCH_HEAD
git switch -c fix/paper-song-status-detail-20261017 b542afb15cb2ac2df9138cd38607f6c5a745b9af
git rev-parse HEAD
bun install --frozen-lockfile
```

Do not proceed through a failed clean-tree or source check. If the branch already exists, inspect and reuse only the same owned branch rather than creating another writer or discarding work. Follow the repository's cloud task-registration and source-publication workflow; workstation records, SSH and deployment credentials are not required.

Report the actual fetched base, branch and HEAD after refresh, confirm the phone head remains preserved, and state the next source deliverable. A short receipt is sufficient:

```json
{
  "writer": "same existing cloud Paper writer",
  "base": "b542afb15cb2ac2df9138cd38607f6c5a745b9af",
  "branch": "fix/paper-song-status-detail-20261017",
  "head_after_refresh": "ACTUAL_FULL_SHA",
  "phone_pr94_head_preserved": "4b5b74532114d27c798bab56951adf7e4b95c69b",
  "new_writer_created": false,
  "next_deliverable": "One source-only song-status entry and detail PR"
}
```

Send the receipt in the existing task/conversation or reply to the coordinator's source-release comment on PR94. Then continue the authorized implementation; this receipt is an execution update, not another approval gate. That reply has now arrived and is recorded above; continue the implementation without a further approval question.

## One next source deliverable

Implement the clarified [01b96161 design acceptance](https://github.com/pirate-social-club/pirate-web-solid/blob/01b961610542b05d51fd43380edd634960487fde/docs/design-handoff/2026-10-16/desktop-song-status/README.md) as one small source-only PR from that base. Relevant paths are:

1. `src/features/communities/community-page/community-page.tsx` and its real-shell stories.
2. `src/features/posts/song-submission/pending-songs.tsx`.
3. `src/features/posts/song-submission/posted-song.tsx` and affected stories.

The store at `src/features/posts/song-submission/song-submission-store.tsx` is a lifecycle reference. Existing dismissal, stopping observation, reload lifetime and published reconciliation already conform; do not reimplement them or create a persistence feature.

At 1280px retain the existing 1152px container, 32px padding/gap, 736px main column and 320px About rail, banner and header. The card fills the fluid main column without a new 640px or fixed 736px cap. Keep its approved 448px minimum height and 24px padding.

Keep the pending article and all current progress, published links, retry/busy, Dismiss, slow Check now/Stop watching, original-binding and uncertain-request controls. Add a separate Status button with the song title in its accessible name and current status as description; never nest controls in a card-sized button. It may select only a currently retained authorized account/community submission. It must not reopen a dismissed song or create another operation.

Adopt Close song status. Focus it on opening and restore focus to the originating authorized Status button, or the safe Post/feed fallback if that trigger disappeared. Preserve native server postHref links with rel=external. Keep the existing session-only memory lifetime, explicit dismissal clearing and already-open same-account published last report. Add no browser storage, durable route or my-submissions API dependency. The drawing's reload/stop-watching annotation ships in NO state.

Prove all four states and existing conditional actions in the real community shell, including busy/nonretryable retries, slow/review alternate copy, original binding/uncertainty, explicit dismissal/no reopening, published reconciliation, focus fallback, a fresh-store absence and account/community isolation. Check accessible naming, link semantics and nonnested controls. Preserve the host's Song/Video-only capability set, including desktop, mobile and overflow exclusion of Live.

Run focused meaningful checks, maintained verify and applicable full hosted Storybook checks; preserve exact results and failures. Return the exact source head and PR for independent review and protected integration. No merge, deploy, provider, credential or financial activation is delegated by this START handoff. The broader remaining work is in [HANDOFF.md](HANDOFF.md).
