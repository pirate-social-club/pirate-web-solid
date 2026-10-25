# Author video deletion client intake

This candidate imports the genuine immutable API client0.135.0 from API666 at875ce9cc6cec77a89d17cde7925980c85c3a2e78. Artifact SHA256 is a4b7e6283b1faa576a06c5579aee8c643e7090ccdbccfdf906a2075211c5fe6c. Its source base is accepted becda5f1. API local source and full runtime tests, five PostgreSQL cases and package verification pass. Protected API source acceptance, independent review and deployment remain pending.

The new browser-session-only operation is delete_postsPostIdVideo. It takes the immutable Post id, sends DELETE with no actor body, and returns a typed video_post_deletion receipt naming that same Post and community with status deleted. Same-origin session/CSRF and server account ownership remain authoritative. The browser retains only the confirmed account/Post intent before dispatch and repeats that target after an unknown outcome.

Before adding the new operation to the runtime guard, the unchanged134 guard passed against installed genuine135: all138 guarded operations and414 runtime-table rows have the same digest f9ff1204df5fe1b7b121ee5d849d033a1c046978de0e7a38338f189c4226f323. The new guard adds only the deletion operation's response schema, success status and error definitions, making139operations/417rows. Its expected digest is computed from the verified immutable135 artifact using the same table order and JSON serialization, then checked by the maintained guard. Earlier vendored artifacts are unchanged.

This source intake does not activate reporting, deploy either product, change a credential or grant a funded operation.
