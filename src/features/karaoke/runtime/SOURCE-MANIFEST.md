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

The scoped karaoke port oxlint override is intentional and temporary: it
preserves the reviewed, byte-identical parser/reducer/capture implementations
and their original fixtures while these modules are kept in parity with the
legacy package. Revisit and narrow/remove the exception when the port diverges
from the source implementation.

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

Port source checkout SHA: `0bc2ea7e8d427b5f5be8824d3943dad29c800f2c`.
The legacy runtime source file history was last committed in `0b1aa65cc31e84c7f82152040df982bda4d677a2`.

## Capture parity hashes

| File | Source → port SHA-256 |
| --- | --- |
| `capture/karaoke-capture-dsp.ts` | `de2d57fee8aa3c52455efe728f5ac5ea5cda97fb3a99c0464b309bc86adc11ea` |
| `capture/karaoke-capture-lifecycle.ts` | `218b1dd2fb3cdf713e8ab1478dd01823fed87c040de70009412ff1ad027194d4` |
| `capture/karaoke-capture-processor.ts` | `412756edb06e87a9074641dd3652dcc23346d3bb33e1f33e44f8b73e72d32555` |
| `capture/karaoke-mic-capture-browser.ts` | `dd2ca71d25a761c82fea0b591bc4b2c6e35f10d7d884371e2880da8a373fc3ac` |
| `capture/karaoke-mic-capture.ts` | `60b415bd195143451e000cf63b0f5209d75e702aa85e286bef1003bca98776f2` |

## Orchestration boundary

The capture/lifecycle tests are 29/29 and the scoring controller tests are
13/13. The framework-neutral controller and network bridge retain their source
logic with only ownership/import and api-next type changes:

| File | Source SHA-256 | Solid port SHA-256 |
| --- | --- | --- |
| `scoring/karaoke-scoring-controller.ts` | `038837005c2fc6eb694f516542fa806a835773f425fa99e3b3041d8d78217b30` | `50a06bd3c703ad1b3c6d8a2cecad247b677f335c45b5eead09795e9e47602416` |
| `karaoke-session-bridge.ts` | `16c1d921243f39e6e07ce3e93e482de73a042236b2fbbb21e960ff7af56c17f9` | `37ba8ad2e62fd7a78ef98397513a2f9d8e99310443af6e4b642edfce044675b4` |

`scoring/use-karaoke-scoring-session.ts` is intentionally a new Solid edge
wrapper, not a React copy. It owns only Solid lifecycle/signals and browser
factory construction; the controller remains framework-neutral.
