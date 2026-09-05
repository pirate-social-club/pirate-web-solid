# Original-audio video runtime

The request and response types come from the exact api-next client 0.60.0
artifact recorded in vendor provenance. The video coordinator does not bind
song terms or construct the song-reference intent. Server submission snapshots
own publication and review decisions. Part receipts and exact commands survive
replay; IndexedDB is account-scoped and is not an authentication source.

Capture productionises the app-owned `spike/video-capture-capability` adapter
at `24b15a83e0dc59ed2d3b024b472f770899c5010d`. It retains pinned Mediabunny
1.55.5, fragmented MP4, bounded H.264 profile selection, native AAC and local
finalization. It excludes the spike's WebM fallback, AAC polyfill, trim
inspector and guide-song paths. Mediabunny is MPL-2.0; its package license
and notices remain in the distributed dependency. Error promises now enter
the capture failure boundary immediately, while orientation and sample-size
changes require a retake. Background visibility changes are not take-ending.

This is an implementation checkpoint, not a release. Typed public playback
integration, real-browser IndexedDB and capture acceptance, definitive command
rejection recovery and final independent review remain. A synthetic transport
fixture proving publication does not prove live media playback. No deployment
or live provider call is claimed by this source.
