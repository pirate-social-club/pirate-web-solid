# Karaoke runtime port

Source: `/home/t42/Documents/pirate-workspace/web/packages/karaoke-runtime`

The framework-neutral runtime source and its test suite were copied into this
feature on 2026-08-18. The source package's only path adjustment is provenance:
`provenance.ts` reads the colocated `build-info.json` after the package boundary
was moved under `src/features/karaoke/runtime`.

The app-facing API boundary is `api-contracts.ts`. It mirrors the api-next v1
session wire shape and maps snake_case API fields to the runtime descriptor;
audio remains a WebSocket payload and the scoring policy retains
`retention: "not_stored"`.

Parity evidence: all 129 original runtime tests pass in the Solid worktree,
plus one api-next adapter test (130 total).

## Source hashes

SHA-256 hashes below are source → port. The changed files are limited to the
provenance import and the client contract adapter; the scoring, session,
transport, codec, serialization, host, and testing implementations are exact
copies.

| File | Source | Port |
| --- | --- | --- |
| `binary-codec.ts` | `e9ba7a11ac478eeb7ee651fa66d32f2a775c8954fb0c1338c214e4a03266c1d0` | same |
| `scoring.ts` | `7d648217c1c824bb378de701205066c490c90e5654e2c8e120955341a86439c7` | same |
| `serialization.ts` | `43fa570fc080b358f0b0c5beed5b99ccb3c7842560eb63d4bb6e4a7fcc0024af` | same |
| `session-host.ts` | `bf91ee7719d600ba249b62dc57209283826f08c57c293fec9d7f2e37c34462f4` | same |
| `session.ts` | `0a1336c19e90ea47aad728743a8737d3d47b471afa151530645f5a54f853fa06` | same |
| `transport.ts` | `7b7459ea2cc1d5424d7d4967f4755430cac8c58afa7c27ca7c09546c32ceb20b` | same |
| `testing.ts` | `3f7221dc6ed545c8b818cba7d686e0f1b10ecc4b307e65410f64314999717fb6` | same |
