# Video capture capability spike — checkpoint 2

Recorded 2026-09-02. This checkpoint is local, credential-free, and does not
contain physical mobile-device evidence.

The repository now has an isolated Storybook harness for the proposed capture
boundary. It can probe WebCodecs, record a fragmented MP4 with Mediabunny,
record the native MediaRecorder WebM fallback, finalize all bytes locally,
re-open the Blob, and report the exact MIME, size, duration, codec, rotation,
track, keyframe, and packet-timeline facts. It also computes the proposed
keyframe-snapped start and last-complete-packet effective end. Nothing in the
harness is imported by the product composer, and it has no upload or provider
client.

## Device evidence is blocked on owner hands

Acceptance requires physical current-supported iOS Safari and Android Chrome
devices supplied and operated by the workspace owner. No device was available
in this session. Browser emulation, desktop Chrome, jsdom, and capability
predicates are not substitutes, so this checkpoint makes no claim about mobile
H.264 availability, actual keyframe cadence, AAC support, A/V drift, dropped
frames, backgrounding, orientation changes, speaker bleed, memory, thermal
behavior, or battery cost.

The next checkpoint must run the `Internal/Video Capture Capability Spike`
story over a secure origin on both physical browser families. It must use only
synthetic visual material and silence or generated non-copyrighted guide audio.
It must record browser and OS versions, exact `MediaRecorder.mimeType`, final
Blob type, emitted encoder configuration, track settings, packet facts, start
and finalize latency, and the required lifecycle/performance matrix.

The physical run must also preserve the actual finalized AVC codec parameter,
the decode-order sequence numbers, presentation timestamps, reordering verdict,
trusted-probe reorder capacity such as FFmpeg's `has_b_frames`, and measured
maximum keyframe gap. A capability predicate is not that evidence.

## Findings that do not require a physical device

Mediabunny 1.55.5 exposes the required primitives: MediaStream video and audio
sources, WebCodecs-backed AVC and AAC encoders, a one-second
`keyFrameInterval`, fragmented MP4 with monotonic output, local BufferTarget
finalization, Blob input, trusted-by-the-client-only packet inspection, and
verified key-packet traversal. The package's `hardwareAcceleration` value is a
preference passed to WebCodecs; browser JavaScript does not reveal the actual
hardware encoder implementation. Physical throughput, thermal, and frame-loss
evidence must therefore carry the viability verdict.

The AAC extension is also pinned at 1.55.5. It is a WASM build of FFmpeg's AAC
encoder running in a worker and adds a material payload and CPU path. The
harness's installed ESM extension bundle is about 975 KiB before application
bundling and transport compression. The
harness loads it only after native AAC fails and only when its checkbox is
enabled. Which devices may use it remains an owner ratification decision.

Both packages declare MPL-2.0. They are spike-only dev dependencies in this
checkpoint. Production adoption still requires the repository's dependency
review and the physical-device verdict.

The strict MIME normalizer accepts the proposed typed families and preserves
the exact observed string. It recognizes RFC 6381 AVC, HEVC, VP9, AAC, VP8,
and Opus families, then rejects missing codec lists, duplicate families,
multiple video or audio codecs, unknown parameters, and container/codec
contradictions. Server probe remains authoritative after upload.

The packet preview uses integer microseconds. It requires an exact emitted
keyframe start, retains eligible packets in decode order, evaluates packet ends
in presentation time, excludes a packet crossing the requested end, and
reports the effective end and tail shortfall. The reordered fixture proves the
decode-order list is independent of presentation-order selection. A provisional
preview mismatch tolerance should be one emitted frame duration plus 1 ms for
timestamp conversion; physical variable-frame-rate fixtures must confirm or
replace that recommendation.

## Copy-target profile checkpoint

The workspace owner settled copy eligibility as server-probed
no-frame-reordering. A reordered stream, an indeterminate packet order, or a
trusted probe reporting nonzero reorder capacity is `transcode_required`; the
client does not attempt to make reordered packet copy safe. Nonzero probe
capacity demotes conservatively even when the packets in one file happened to
remain in presentation order.

The preferred adapter no longer asks for generic AVC. It requests the exact
RFC 6381 Constrained Baseline profile and selects the lowest bounded level from
the actual camera dimensions and frame rate. The current spike matrix is:

| Dimensions and rate | Macroblocks/frame | Macroblocks/second | Candidate |
| --- | ---: | ---: | --- |
| 640 × 480 at 30 fps | 1,200 | 36,000 | `avc1.42e01e` (Level 3.0) |
| 720 × 1280 at 30 fps | 3,600 | 108,000 | `avc1.42e01f` (Level 3.1) |
| 1080 × 1920 at 30 fps | 8,160 | 244,800 | `avc1.42e028` (Level 4.0) |

A source above these bounded Level 4.0 limits is rejected by this candidate.
Level choice remains evidence-based: the physical run must show that the
requested resolution is actually granted and that the finalized track reports
the actual profile and level. A browser that silently emits another AVC profile
creates a requested-versus-observed evidence mismatch, but that mismatch alone
does not demote an otherwise H.264, no-reordering source. The future server may
use the preserved profile and level for a separate compatibility decision.

Mediabunny's packet `sequenceNumber` represents decode order and packet
`timestamp` represents PTS. Its browser API does not expose source DTS. The
harness now records both decode and presentation order, counts PTS regressions
in decode order, and reports frame reordering as true, false, or indeterminate.
It does not claim to parse H.264 slice types or expose FFmpeg's `has_b_frames`
field. Only defined unique sequence numbers with strictly increasing PTS
produce local `no_reordering`. The local result is still advisory. The physical
file must receive a trusted probe, and its reorder-capacity value must be
recorded next to these packet facts.

Local `copy_target` now derives only from a finalized H.264 codec plus proved
no reordering, subject to conservative demotion when a trusted nonzero reorder
capacity is supplied. Requested profile, observed profile, observed level, and
whether the exact request was honored are carried separately as evidence.

Start snapping selects the nearest eligible emitted keyframe at or before the
requested start. It never chooses a later keyframe. This is covered for exact
hits and between-keyframe requests and matches the future server direction.

The adapter still requests realtime latency, hardware preference, and a
one-second keyframe interval. All three are hints. The harness reports the
encoder configuration and measured maximum emitted keyframe gap; only the
finalized file and physical performance run determine viability.

The harness currently captures out-of-band Mediabunny encoder errors and
rethrows them when Stop finalizes the file. That deferred behavior is acceptable
only in this evidence harness. A production composer must immediately leave its
recording state and surface a typed encoder failure when either media source's
error promise rejects.

Fragmented MP4 is used only to make local capture/finalization bounded. The
complete Blob and exact byte length exist before any future reservation. Live
upload and unknown-size multipart behavior are absent by construction.

## Sources and reproducibility

The implementation follows the package's official output-format, media-source,
packet, supported-codec, and AAC-extension documentation at
`https://mediabunny.dev/`. Package versions and integrity hashes are frozen in
`bun.lock`.

Run the automated checkpoint with:

    bunx vitest run --config vitest.app.config.ts \
      src/features/posts/video-capture-spike/video-capture-model.test.ts
    bun run tsc --noEmit -p tsconfig.json
    bunx oxlint src/features/posts/video-capture-spike
    bun run build-storybook
    git diff --check

No network upload, provider request, deployment, remote publication, personal
recording, or copyrighted recording is part of this checkpoint.

## Checkpoint gates

The focused Vitest command passed 25 tests. TypeScript, changed-path oxlint,
and `git diff --check` passed with no output. The full `bun run
build-storybook` gate was retried under a 60-second hard cap. It reached Vite's
`transforming` phase and then exited 124 when the cap sent SIGTERM; it emitted
no module-resolution or Mediabunny/AAC-worker error before the timeout. The
full catalog build remains pending, and no passing Storybook-build claim is
made.
