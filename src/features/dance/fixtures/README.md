# Capture prefix fixture

`capture-prefix-avc-aac.mp4` is a locally generated moving test
pattern and 440 Hz tone. It contains baseline AVC without reordered frames and
mono AAC at 48 kHz. It contains no person, private recording or provider media.
Its SHA-256 is `1c731bc520b184004e77eb44e614585a8f6830244dc0a7e656a0594d74b79aaa`.
Recompute with `sha256sum capture-prefix-avc-aac.mp4`.

Generate it with FFmpeg using:

```sh
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i testsrc2=size=180x320:rate=30 \
  -f lavfi -i sine=frequency=440:sample_rate=48000 \
  -t 8.4 -c:v libx264 -preset ultrafast -threads 2 -crf 32 \
  -pix_fmt yuv420p -profile:v baseline -bf 0 -g 30 \
  -c:a aac -b:a 64000 -ac 1 -use_editlist 0 -movflags +faststart \
  capture-prefix-avc-aac.mp4
```

The media test verifies that bounding the result at 8013 ms preserves encoded
packet bytes, original timestamps and the complete prefix including a cue.
This endpoint is deliberately not a video or audio packet boundary. The
fixture presents both tracks from zero, including codec priming; the
8.4-second generated source has an approximately 8.421-second container.
It proves packet handling,
not camera operation, guide synchronization, provider admission or phone
acceptance. Those require the actual capture journey.

`capture-preroll-avc-aac.mp4` is a small refusal fixture with negative AAC
pre-roll. Generate it with the same command, replacing the pattern size with
16x16, the duration with 0.1, omitting `-use_editlist 0`, and changing the
output filename. Its SHA-256 is
`5a86cc1fc73af579670645390499b4770a77b30db86b0c4b7b549cb38050b976`.
Non-presented packets may still seed decoder history. The capture prefix path
refuses this case instead of dropping that history or shifting timestamps.
