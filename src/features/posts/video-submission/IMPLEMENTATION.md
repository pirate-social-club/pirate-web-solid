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

Definitive non-retryable reserve/start rejection requires explicit editing
before another attempt. Ambiguous outcomes retain their exact command for
replay; an existing server submission cannot be discarded as a rejected draft.
Feed and Post surfaces expose typed pending delivery states. Even a projected
ready status does not authorize turning an opaque reference into a media URL.

This is an implementation checkpoint, not a release. Playback-ready wiring
and end-to-end browser acceptance are blocked on
api-video-delivery-completion and its consumable access contract. The closed
publication lane is not evidence of backend deployability. Real-browser
IndexedDB and capture checks, remaining interruption cases and independent
review remain open. A synthetic transport fixture proving publication does
not prove live playback. No deployment or live provider call is claimed.
