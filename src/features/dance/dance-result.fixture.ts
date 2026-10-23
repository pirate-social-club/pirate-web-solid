import type { DanceResult } from "./dance-result-api.ts";

// Copied fictional pure-producer projections; no API workspace runtime/build import.
// Source5ee0e1ed, moderatedDanceFixture and projectPrivateDanceReview.
// No real recording, provider, policy or financial admission is represented.
const uploaded = {
  "version": "dance-private-review-v1",
  "review_id": "review",
  "session_id": "session",
  "attempt_id": "attempt",
  "community_id": "community",
  "song_post_id": "song",
  "audio_revision": 1,
  "choreography_id": "dance",
  "choreography_revision": 1,
  "segment_id": "segment",
  "review_revision": 1,
  "session_terms_hash": "3333333333333333333333333333333333333333333333333333333333333333",
  "qualification_policy_version": "qualification-v1",
  "qualification_policy_hash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "captured_policy": {
    "version": "moderator-review-policy-v1",
    "hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "rubric_version": "rubric-v1",
    "rubric_hash": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    "normalization_version": "normalization-v1",
    "normalization_hash": "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "safety_hash": "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    "retention_hash": "1111111111111111111111111111111111111111111111111111111111111111",
    "admission": "streak_admitted",
    "admission_version": "admission-v1",
    "admission_hash": "2222222222222222222222222222222222222222222222222222222222222222"
  },
  "state": "uploaded",
  "uploaded_at": "1970-01-01T00:00:01.000Z",
  "submitted_at": null,
  "review_deadline": "1970-01-08T00:00:01.000Z",
  "terminal_at": null,
  "verdict": null,
  "score_bps": null,
  "qualification_ref": null,
  "cue_attestation": null,
  "initial_submit_receipt": null,
  "show_publicly_if_passed": null,
  "publication_choice_revision": 0,
  "publication_status": "none",
  "publication_revision": 0
} as const satisfies DanceResult;
export const danceResultFixtures = {
  uploaded,
  awaiting: { ...uploaded,
  "review_revision": 3,
  "state": "awaiting_review",
  "submitted_at": "1970-01-01T00:00:02.000Z",
  "initial_submit_receipt": {
    "receipt_id": "submit",
    "show_publicly_if_passed": false,
    "publication_disclosure_version": "disclosure-v1",
    "submitted_at": "1970-01-01T00:00:02.000Z"
  },
  "show_publicly_if_passed": false,
  "publication_choice_revision": 1,
  "publication_revision": 1
},
  passed: { ...uploaded,
  "review_revision": 4,
  "state": "reviewed",
  "submitted_at": "1970-01-01T00:00:02.000Z",
  "terminal_at": "1970-01-01T00:00:04.000Z",
  "verdict": "passed",
  "qualification_ref": "review",
  "cue_attestation": "affirmed",
  "initial_submit_receipt": {
    "receipt_id": "submit",
    "show_publicly_if_passed": false,
    "publication_disclosure_version": "disclosure-v1",
    "submitted_at": "1970-01-01T00:00:02.000Z"
  },
  "show_publicly_if_passed": false,
  "publication_choice_revision": 1,
  "publication_revision": 2
},
  notPassed: { ...uploaded,
  "review_revision": 4,
  "state": "reviewed",
  "submitted_at": "1970-01-01T00:00:02.000Z",
  "terminal_at": "1970-01-01T00:00:04.000Z",
  "verdict": "not_passed",
  "cue_attestation": "not_attested",
  "initial_submit_receipt": {
    "receipt_id": "submit",
    "show_publicly_if_passed": false,
    "publication_disclosure_version": "disclosure-v1",
    "submitted_at": "1970-01-01T00:00:02.000Z"
  },
  "show_publicly_if_passed": false,
  "publication_choice_revision": 1,
  "publication_revision": 2
},
  reviewExpired: { ...uploaded,
  "review_revision": 4,
  "state": "review_expired",
  "submitted_at": "1970-01-01T00:00:02.000Z",
  "terminal_at": "1970-01-08T00:00:01.000Z",
  "initial_submit_receipt": {
    "receipt_id": "submit",
    "show_publicly_if_passed": false,
    "publication_disclosure_version": "disclosure-v1",
    "submitted_at": "1970-01-01T00:00:02.000Z"
  },
  "show_publicly_if_passed": false,
  "publication_choice_revision": 1,
  "publication_revision": 2
},
  withdrawn: { ...uploaded,
  "review_revision": 4,
  "state": "withdrawn",
  "submitted_at": "1970-01-01T00:00:02.000Z",
  "terminal_at": "1970-01-01T00:00:04.000Z",
  "initial_submit_receipt": {
    "receipt_id": "submit",
    "show_publicly_if_passed": false,
    "publication_disclosure_version": "disclosure-v1",
    "submitted_at": "1970-01-01T00:00:02.000Z"
  },
  "show_publicly_if_passed": false,
  "publication_choice_revision": 1,
  "publication_revision": 2
},
} as const satisfies Readonly<Record<string, DanceResult>>;
