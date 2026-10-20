# Spaces discovery client intake

This source slice consumes the genuine api-next client 0.125.0 archive, SHA256 d47b6d6f0b1a3663dd1fba90413021f16fffea91b5fc1b28ade7a7ae13d92b86. The four published package files are unchanged. Earlier vendor artifacts remain retained.

API PR631 source dcf83068156e366f18f197e32fa3c9d2dbd24f3c has independent source and native review plus all fourteen hosted checks. Its normal main-inheritance successor 0518781f3d4f615842d3539b67e3ee90c5240ff1 preserves those discovery and client bytes; fresh type and database gates pass there, but its inherited Hono 4.13.7 dependency fails advisory policy GHSA-5r4p-p66f-jhc7. Whole-head source qualification remains incomplete. Neither source is represented as API main or as serving code.

The strict public discovery response adds current_availability to Spaces offerings only. An exact object containing only kind=available admits a new client request. Temporarily unavailable, missing or malformed availability keeps an otherwise supported offering visible and blocks new attempts and wallet setup. The server independently authorizes every transaction. Existing private requests retain their original commands, recipients and keys.

The API, generated client, Solid consumer and infra readiness observer require a paired staging release. This implementation alone establishes no runtime timing, claimability, observer renewal or production activation. Financial, Dance and mainnet holds remain unchanged.
