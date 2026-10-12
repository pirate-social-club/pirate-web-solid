# Review corrections, 2026-10-13

The review found a dispatch gap in the state-machine plan and an inventory finding associated with this handoff. Both are corrected here. This revision preserves the initial `efb3cac` documents as Git history and supplements their scope; it changes no application source.

## Work ownership and order

Posting coverage belongs to `solid-storybook-state-coverage-map`, with `workspace_state_coverage_coordinator` responsible on the workstation. Its updated record is exported alongside this note. The source task remains planned until governed worktree admission. The coordinator completed a read-only baseline: video already has a 17-state coverage map, text has six actor states and song has nine observer states. Start by reviewing and reusing the video map, then extend coverage where useful. No new actor framework or duplicate registry is proposed.

HNS/Spaces and feed-machine sections are reference proposals, not work dispatched to the cloud Storybook agent. Specs 012 and 013 are not exported. Their accepted behavior review stays on the workstation and with the existing naming/Spaces owners. Naming is active with review and capacity extending to 2026-10-16. Spaces owner recovery remains planned and dependent on `solid-naming-karaoke-source-integration`. The state review does not take source custody from those lanes.

The exclusive Storybook task reserves `Flows/Community/JoinAndName` and `Flows/Community/Address` to the existing naming/Spaces integration before implementation. Their sheet rows remain in the full 95-sheet accounting as `owned_elsewhere`. The implementer may audit the references, but controller, story, string or flow-wiring changes require the owning lane's recorded handback. Existing accepted evidence from that lane may satisfy the corresponding reconciliation rows.

The owner instruction quoted in the original direction was received in the coordinator session. The repository records that attestation; it does not include an independently verifiable owner transcript. No new approval is requested or inferred from this review.

## Duplicate feed trace

At Solid `45d07cb25b3267ad16f158aa40eff7d11ad49c5e`, `src/routes/index.tsx:22` imports `HomeFeedProps` as a type, line 24 imports `PublicFeedProps` as a type, and line 32 imports the real `HomeVideoFeed`. The route JSX renders `HomeVideoFeed`.

`src/features/posts/feed/public-feed.tsx:5` imports `fetchHomeFeedPage` from `home-feed-adapter.ts`. That is a live adapter shared with the Home route, not an import of the `HomeFeed` component. `HomeFeed` imports `FeedSurface`, which renders the internal `FeedItemCard`; neither component is reached from production route roots after excluding type-only edges. Tests render these old components, which is a separate relationship.

The syntax trace covered 472 source modules and 38 route/entry roots, with literal relative imports, exports and dynamic imports. [source-review.json](source-review.json) records the relevant incoming edges. The route JSX was also inspected. No built-bundle or live runtime check ran. Keep the duplicate presentation cleanup separate and preserve the live adapters; nothing was deleted.

## API query distinction

At API `4a791f27fb7c983689fe75150953be67ed25f709`, `profile-activity-repository.ts:9` and `public-community-threads-repository.ts:262` restrict their post types to text and song. These are the two exclusion sites relevant to the card/profile rollout dependency.

The separate `feed-repository.ts:403` clause permits non-video posts or videos with ready ingest, a provider video id and enrichment not failed. It filters unready videos, not all videos. Do not change or describe that predicate as an unconditional video exclusion.

## Inventory correction

`handoffs/paper-cloud-storybook-handoff-2026-10-12.zip` is a handoff-related local archive, 89,080,533 bytes, SHA256 `ff7b4de3bc8ac23419cd673feafe23fec365f25ed7ed673e3d285d4b56568f84`. It includes nested delivery ZIPs. Its 468 file entries pass ZIP CRC verification. Its creator is not established, and it has not been compared byte for byte with the present directory. It is retained and now indexed. It was incorrect to describe its inventory failure as merely an earlier unrelated mismatch.

The previously unindexed `paper-create-community-join-policy-page-2026-10-10` package is also indexed. The handoff inventory finding is resolved. The staging checker still exits 1 with three findings: `Root directory inventory differs: ['.cloudflare']`; `Unexpected loose root files: ['AGENTS.md', 'CLAUDE.md', 'README.md', 'error.log']`; and fourteen unlisted archive directories. The loose-file message lists the entire root file set; the three instruction/index files are allowed and `error.log` is the extra file. No root cache, log, archive or preserved evidence was deleted or moved.

## Verification limits

Checks here are task-record validation, source syntax/reference analysis, ZIP integrity, package checksums and publication readback. No app build, test suite, rendered Storybook, device, staging or live API check ran. Source inventory linkage is not executed transition coverage or visual parity.
