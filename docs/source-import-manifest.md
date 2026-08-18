# Solid UI source import manifest

This document records the source-preservation tranche for the standalone
clean-slate application. The imported files are preserved as source only; they
are not wired into the current app, package graph, Worker, or runtime.

## Source and destination

- Source repository: `/media/t42/codedrive/Code/pirate-workspace/web`
- Source ref: `refs/archive/solid-source-20260818`
- Source commit: `513741c749cc41aab05357cb3bb1200c52096e76`
- Source `packages/solid-ui` tree: `d18322051fb99c5547d9c9a87c6812bd34375ae7`
- Destination: `packages/solid-ui`
- Future standalone app tree: `527974f2496d56c6e966790222343a68fd6748b9` (pending)

## Included and excluded paths

Included are all 240 tracked files under the source
`packages/solid-ui` tree except the explicitly excluded lockfile. This
preserves the framework-pure Solid design-system/catalog source, including its
`.storybook/`, `patches/`, `scripts/`, `src/`, `package.json`, `tsconfig.json`,
and `vitest.config.ts` paths.

Excluded from this tranche:

- `packages/solid-ui/bun.lock` (the source tree has 241 tracked files total;
  this is the one omitted file).
- `node_modules/` and build-output paths; none are tracked in the source tree
  or imported here.
- React, legacy API, route-migration, dispatcher, and compatibility files;
  none are present in this source package and none were imported.

No current app source, runtime/configuration, dependency manifest, or package
wiring was changed by this import.

## Verification

The source ref's recursive tracked-file list and the target index's staged
file list were normalized to `<blob-id> <relative-path>`, excluding only
`bun.lock`, and compared with `diff -u`. The comparison had no differences:

- Included files compared: 240
- Source normalized-list SHA-256: `bc3d5a10744a3a247edafbe044d8d0dec93d6597c920acc3441bf43c98ef9c2d`
- Target normalized-list SHA-256: `bc3d5a10744a3a247edafbe044d8d0dec93d6597c920acc3441bf43c98ef9c2d`

The imported source was also scanned for clean-slate boundary violations:

- `@pirate/web-platform`: no matches
- `@pirate/route-contracts`: no matches
- Legacy hostnames (`api-staging.pirate.sc`, `api.pirate.sc`, or
  `pirate.sc`): no matches
- `solid-edge`, service-binding, or Cloudflare service-binding references: no
  matches
- Direct React or React DOM imports: no matches

The excluded source lockfile contains Storybook/MDX transitive React entries
(`@mdx-js/react`, Storybook's React DOM shim, and related React packages).
Those lock-only references were not imported and are distinct from source
imports.
