# Video capture capability spike — checkpoint 3

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
    bun run lint
    bun run test:app
    bun run build-storybook
    git diff --check

No network upload, provider request, deployment, remote publication, personal
recording, or copyrighted recording is part of this checkpoint.

## Checkpoint gates

The branch was rebased without conflicts onto local `main` at `95070a3`. Range
comparison showed all three spike commits remained patch-identical.

The focused Vitest command passed 25 of 25 tests in 3.92 seconds. Changed-path
oxlint passed in 0.76 seconds. Full `bun run lint` passed in 1.91 seconds with
repository warnings and no errors. `git diff --check` passed with no output.
The previously capped Storybook check was replaced with an uncapped run:
`bun run build-storybook` completed successfully in 92.74 seconds. The capture
story, Mediabunny adapter, and optional AAC worker all resolved in the built
catalog.

Two repository-wide gates are not green on the rebased baseline. `bun run tsc
--noEmit -p tsconfig.json` exited 2 in 16.13 seconds on missing or incompatible
generated-client symbols used by community moderation, karaoke, public feed,
post engagement, and Study code. It reported no capture-spike file error. `bun
run test:app` exited 1 in 22.26 seconds: 315 of 331 tests passed and 16 failed
across six suites in those same generated-client consumers. The failures are
outside this task's paths and were not changed or suppressed here.

Physical-device acceptance remains blocked on owner-operated,
current-supported iOS Safari and Android Chrome devices. This checkpoint did
not attempt or simulate that evidence.

## First physical Android run — 2026-09-03

One physical device was operated by the workspace owner and driven over ADB by
the assistant. This does **not** satisfy the Android Chrome gate: the running
package is `app.vanadium.browser` (Vanadium on GrapheneOS), whose engine
reports `Chrome/152.0.7977.64`. It is Android Chromium evidence only; stock
Chrome and iOS Safari runs remain outstanding.

Device and origin: Pixel 8 (`shiba`), served from the workstation over
`adb reverse tcp:6006`, so the page ran on `http://localhost:6006` and reported
`secureContext: true`. The reported user agent is the reduced
`Android 10; K` string, not the true OS version.

Capability probe: `cameraApi`, `webCodecs` and `avcEncode` all true;
`nativeAacEncode` true, so the spike-only AAC polyfill was switched off and
every result below is the native encoder. All three Constrained Baseline
candidates reported supported — 640x480 `avc1.42e01e` level 3.0, 720x1280
`avc1.42e01f` level 3.1, 1080x1920 `avc1.42e028` level 4.0.

### fMP4 target, WebCodecs through Mediabunny

The finalized Blob advertised
`video/mp4; codecs="avc1.42e01f, mp4a.40.2"`, but parsing the finalized bytes
found `avc1.42001f`: `profile_idc` 66 with constraint flags `00`, level 3.1.
That is **Baseline, not Constrained Baseline**. The declared MIME type
therefore misrepresents the actual bitstream, which is direct evidence that a
client content-type declaration cannot be trusted and server-side probing of
the sealed object is mandatory.

Trusted FFprobe on the downloaded file reports `has_b_frames: 0`, profile
`Baseline`, level 31. Converting to Annex-B shows the stream opens SPS, PPS,
IDR slice, and repeats parameter sets at every keyframe, so the renderer's
IDR-start requirement is met by inspected bytes rather than by a container
flag. Across 384 video packets there are 13 keyframes at a uniform 1.000 s
gap, so the one-second `keyFrameInterval` request was honoured. Presentation
time never regresses in decode order and `pts` equals `dts` on every packet,
with a maximum absolute divergence of 0.

With the trusted reorder capacity of `0` applied, the harness verdict is
`copy_target` with no disqualifying reasons. That establishes copy
**eligibility** for this source, not a proven copy path: these bytes have not
been through the pinned server renderer, and no output packet-digest
comparison has been made against them. The renderer spike's fast path remains
proven only on its own synthetic fixtures. The copy preview snapped its
start to the 1.000 s keyframe and reported a 49.605 ms tail shortfall over 354
selected packets, which is the last-complete-packet rule behaving as
specified. Audio ran 12.8496 s against 12.800 s of video, a 49.6 ms overhang
consistent with the AAC priming and padding already measured by the renderer
spike. Finalization took 291 ms; an earlier 62.76 s / 32.35 MB take finalized
in the same 291 ms.

Two cautions. Because this encoder emitted no `pts`/`dts` offset at all, this
run does **not** exercise the renderer's tolerance for a constant decode-to-
presentation offset; that branch still needs a device that produces one.
And Baseline implying no B-slices is the expected result, not a licence to
broaden the ratified Constrained Baseline matrix — eligibility must continue
to come from the trusted probe and the server IDR check, not from a profile
string, and one non-stock browser on one device cannot carry a matrix
amendment.

### WebM fallback, MediaRecorder

`MediaRecorder.mimeType` and the Blob both reported
`video/webm;codecs=vp9,opus`; FFprobe confirms VP9 Profile 0 with mono 48 kHz
Opus, `has_b_frames: 0`, monotonic presentation. The harness verdict is
`transcode_required` for the correct reason — the finalized codec is not
H.264. Finalization took 65 ms for 4,225,035 bytes over 12.896 s, roughly four
times faster than the fMP4 path.

The material finding is keyframe cadence: 386 packets carried only 4
keyframes, at 3.417 s, 3.373 s and 3.368 s. This harness constructs the
recorder as `new MediaRecorder(stream, { mimeType })` and passes no keyframe
option, so the run shows only what this configuration produced on this
browser. It is **not** evidence that the API offers no control: MediaStream
Recording defines `videoKeyFrameIntervalDuration` and
`videoKeyFrameIntervalCount` as encoder hints, and neither was requested here.
Whether Vanadium and stock Chrome accept and honour those options is an open
question the next fallback run must answer before any conclusion is drawn
about short GOPs on the fallback path. As configured today, keyframe-snapped
trimming is demonstrated only on the WebCodecs target, and a WebM source is
trimmed frame-accurately during its mandatory transcode regardless.

### Provenance of the trusted probe

The two analysed recordings are held outside Git in session temporary storage
and are expected to disappear; these digests, commands and versions are the
durable record.

| Artifact | SHA-256 |
| --- | --- |
| WebCodecs take, MP4 | `b7fb946065bc863791b78e0ca93df910bc5b1b5b2866cd0eb6a0ab95898cd357` |
| Fallback take, WebM | `76d5d624aceb5de4a501601063ee6d204ea98c413609439257db1cf33ffa9c20` |

Trusted probe tooling was `ffprobe`/`ffmpeg` version `6.1.1-3ubuntu5`. The
stream facts came from
`ffprobe -v error -show_entries stream=index,codec_name,codec_type,profile,level,has_b_frames,width,height,r_frame_rate,nb_frames,duration,channels,sample_rate -of json`,
the packet timeline from
`ffprobe -v error -select_streams v:0 -show_entries packet=pts_time,dts_time,duration_time,flags,size -of json`,
and the NAL inspection from
`ffmpeg -v error -i <file> -map 0:v:0 -c copy -bsf:v h264_mp4toannexb -f h264`
followed by start-code scanning for `nal_unit_type`.

Device and browser identity: Pixel 8 (`shiba`), Android 17 (API 37), security
patch 2026-08-05; Vanadium `152.0.7977.64.0`, engine reporting
`Chrome/152.0.7977.64`. The page was served over `adb reverse tcp:6006` so the
origin was `http://localhost:6006`, and the harness was read and driven through
the DevTools protocol over `adb forward tcp:9222`.

### Still outstanding

This run covered format and copy-eligibility evidence only. The lifecycle and
performance matrix is untouched: app-switch and backgrounding, orientation
change, start-up latency, audio/video drift, dropped frames, memory, thermal
behaviour and battery cost. Stock Android Chrome and current iOS Safari both
remain required.

Handling: the first take was made with the front camera, contained the
operator's face, and was discarded by reloading the story without being
downloaded, probed or copied; only the harness's textual metadata was read
from it. The harness did not intentionally download or copy that Blob, though
no claim is made about browser-internal temporary storage. The two analysed
takes are face-free wall footage held outside the repository, and only
container, bitstream and timing structure were inspected. No imagery was
opened, and no recording is added to Git.

## Second physical Android run — Brave 151, 2026-09-03

One physical device was again operated by the workspace owner and driven over
ADB by the assistant. The browser this time is Brave `151.0.0.0`, engine
reporting `Chromium/151.0.0.0` — a second, independent current-generation
Chromium build on the same Pixel 8 (`shiba`, Android 17, GrapheneOS). This is
deliberately a vendor Chromium build, not stock Chrome: the device's
`org.chromium.chrome` package reports Chromium `101.0.4951.54`, which is four
years stale and cannot serve as current-Chrome evidence, so Brave was the
only current engine available without installing anything. Whether vendor-
build Chromium evidence may satisfy the Android Chrome gate is an owner
ruling that remains open; nothing in this section claims it does.

The page was again served over `adb reverse tcp:6006` (`http://localhost:6006`,
`secureContext: true`) and driven through the DevTools protocol. The reduced
user agent reports `Android 10; K`; the true platform version is Android 17.

Capability probe: identical to the Vanadium run — `cameraApi`, `webCodecs`,
`avcEncode` all true; `nativeAacEncode` true with the polyfill off; all three
Constrained Baseline candidates reported supported.

### fMP4 target, camera plus microphone

Across two takes (31.278 s / 16,104,958 B, and a corroborating 19.900 s /
10,241,651 B), every fact replicated the Vanadium result on this hardware:

- Declared MIME `video/mp4; codecs="avc1.42e01f, mp4a.40.2"`, but the
  finalized bytes parse as `avc1.42001f` — `profile_idc` 66, constraint
  flags `00`, level 3.1: **Baseline, not Constrained Baseline**. The
  declared-MIME misrepresentation is therefore cross-build on this device,
  which strengthens the server-side-probe mandate.
- Encoded 1280 × 720, `latencyMode: realtime`, `prefer-hardware`, variable
  4 Mbit/s.
- `maximumKeyframeGapUs` exactly 1,000,000 on every fMP4 take: the
  one-second keyframe request was honoured exactly.
- `no_reordering`: defined unique decode-order sequence numbers, zero
  presentation-timestamp regressions, zero duplicates.
- Native AAC, mono 48 kHz, echo cancellation, noise suppression and auto
  gain control all on.
- Finalization 223 ms for the 16.1 MB take.

Camera-only take (9.800 s / 4,907,408 B, 90 ms): a video-only
`video/mp4; codecs="avc1.42e01f"` declaration with the same observed
Baseline bitstream, the same exact one-second keyframe cadence and no
reordering.

Short-duration fixture (1.586 s / 772,077 B, 46 ms): uniform one-second
keyframes hold even in a file barely longer than one GOP.

### WebM fallback, MediaRecorder

6.464 s / 1,144,440 B finalized in 55 ms. `MediaRecorder.mimeType` and the
Blob both reported `video/webm;codecs=vp9,opus` and the inspection parsed
VP9 plus mono Opus, `no_reordering`. The harness reports
`maximumKeyframeGapUs: null` for this container, so keyframe cadence on the
fallback path remains unmeasured here — the open `videoKeyFrameInterval*`
question from the first run is untouched by this take.

### Lifecycle findings new to this run

**Orientation change mid-capture is a hard failure of the fMP4 path.** With a
capture running, rotating the device to landscape caused the camera to emit
720 × 1280 samples into an encoder configured for 1280 × 720; Mediabunny
errored `Video sample size must remain constant. Expected 1280x720, got
720x1280` and no file was finalized. The harness's deferred-error handling
surfaced the failure text at the Stop boundary, exactly the limitation
already recorded above. A production composer must pin the capture
orientation or explicitly handle a size change; it cannot assume a fixed
sample size across rotation.

**Backgrounding for five seconds mid-capture was survived.** The session
continued recording through the background gap, the timeline stayed
continuous at 22.756 s, keyframes stayed uniform at exactly one second across
the gap, and the take finalized in 1,123 ms — the slowest finalization
observed on this device, plausibly the cost of recovering after returning to
the foreground. This is one five-second sample, not a claim about longer
backgrounding or OS suspension policy.

**Denied microphone was not successfully exercised on-device.** Revoking
`android.permission.RECORD_AUDIO` from the browser at the OS level was
superseded when the permission was re-granted from the user side during the
next prompt (the package flags show `USER_SET`), producing another ordinary
camera-plus-microphone take instead of a denial. A DevTools
`Browser.setPermission` denial for the origin did not reach the media stack:
the subsequent take still carried audio. The denied-microphone path remains
proven only by the harness's focused tests, not by physical evidence.

Battery cost was unmeasurable this session because the device was charging
over USB for the whole run (`navigator.getBattery()` reported
`charging: true`, level 1.0). The harness exposes no memory instrumentation,
and start-up latency is not separately timed by the harness, so neither is
claimed here.

Handling: all takes used the front camera and may contain the operator's
surroundings. None was downloaded; only the harness's in-page textual
metadata and its byte-level in-page inspection were read. No recording was
added to Git, and no trusted-probe digests exist for this run for that
reason; the finalized-byte facts above come from the harness parsing the
completed Blob in the page.

### What this run changes

Two current Chromium builds on the same hardware now agree on every
format fact: declared Constrained Baseline, actual Baseline, exact
one-second keyframes, no reordering, native AAC, and a fast local
finalization with exact size known before any reservation. The Android
format picture is consistent; the open items are the owner ruling on whether
vendor-build Chromium satisfies the Android Chrome gate, stock Chrome and
iOS Safari if it does not, memory and battery measurement on an unplugged
device, and the fallback-path keyframe-control question.
