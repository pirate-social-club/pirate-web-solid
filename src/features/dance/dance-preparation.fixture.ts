import type { DanceCaptureContext } from "./dance-preparation-api.ts";

// Fictional hash-valid producer projection, independently owned test data.
// No workspace import, real media, admission or financial operation.
export const dancePreparationFixture: DanceCaptureContext = {
  "version": "dance-moderated-capture-context-v1",
  "session": {
    "version": "dance-moderated-session-v1",
    "session_id": "test-capture-session",
    "review_id": "test-capture-review",
    "attempt_id": "test-capture-attempt",
    "community_id": "test-community",
    "song_post_id": "test-song",
    "choreography_id": "dance",
    "choreography_revision": 1,
    "terms_hash": "ce5c311ba4d7da582b65bb1ece458a93d2336521ea26c643795270f7d95f621b",
    "policy_hash": "561b79a63ea47ef6861d5894e4ad10a33c7a8822e283f7148cd3ed15511ee15d",
    "consent_version": "consent-v1",
    "consent_hash": "328b8cbea049a63364abaf1b27e03eb5ea8b2b8f99f522c59eeedb4454babe2f",
    "retention_hash": "dda46c3a76f18d81f5df37babc4e18be7e326dec2da4f4ed57d45b8a567917bf",
    "normalization_version": "normalization-v1",
    "normalization_hash": "e24b0144b15326e0b11128478dce7b95fb88553d3d9afa4611e2eb1632b96ecc",
    "safety_hash": "8f1282ad88d4286980d31784b2b506417375bbff80dac1e247578ad5573e73e4",
    "state": "created",
    "created_at_ms": 1000,
    "expires_at_ms": 121000,
    "body_start_ms": 2000,
    "body_end_ms": 12000,
    "cue": {
      "kind": "arms_t",
      "start_ms": 0,
      "end_ms": 2000,
      "hold_ms": 1000
    },
    "maximum_bytes": 1000000,
    "upload_id": null,
    "upload_state": null,
    "uploaded_at_ms": null,
    "review_deadline_ms": null,
    "score_bps": null
  },
  "persona_id": "persona",
  "audio_revision": 1,
  "segment_id": "segment",
  "reference": {
    "reference_post_id": "test-reference-post",
    "video_render_revision": "test-reference-render",
    "reference_terms_hash": "2509b370f5646fa97765a32a9766b875e9aea3cbd83bce5e36d97b7d05416283",
    "canonical_song_start_ms": 10000,
    "canonical_song_end_ms": 20000,
    "reference_body_start_ms": 0,
    "reference_body_end_ms": 10000
  },
  "reward_mode": "reward_eligible",
  "rewards_enabled": false,
  "captured_policy": {
    "admission": "money_admitted",
    "admission_version": "test-admission-dance",
    "admission_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "qualification_policy_version_id": "test-policy-dance",
    "qualification_policy_hash": "09bc372ca82818349a65c3e50f3b03e426efd76555f321f83ef2425347573311",
    "producer_id": "test-producer",
    "publication_disclosure_version": "disclosure-v1",
    "rubric_version": "rubric-v1",
    "rubric_hash": "4a3d86d1c367bbe870d84ac7c995403e7a1b8f2b1cdc854a9306f7bf64da0cbd"
  },
  "disclosure": {
    "version": "dance-moderated-disclosure-v1",
    "consent_text": "Fictional private consent",
    "retention_text": "Fictional bounded retention",
    "publication_text": "Fictional independent optional Post",
    "owner_rubric_text": "Fictional assigned cue and selected dance rubric"
  },
  "objectives": [
    {
      "target": {
        "community_id": "test-community",
        "post_id": "test-song",
        "canonical_song_id": "test-song",
        "audio_revision": 1,
        "kind": "committed",
        "offer_id": "test-offer",
        "pool_leg_id": "test-leg"
      },
      "terms": {
        "version": "shared-song-megapot-v2",
        "profile_id": "test-profile",
        "profile_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "terms_hash": "d08c1341b789a9de6566e6fd41f092b2476427c5c3e9a573138955141bfa2c47",
        "funding_policy_revision": 1,
        "funding_policy_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "budget_source": "leg_budget",
        "empty_behavior": "no_purchase",
        "eligible_activities": [
          "study",
          "karaoke",
          "dance"
        ],
        "dance_scope": "any_policy_accepted",
        "starts_at": "2026-10-22T10:00:00.000Z",
        "ends_at": "2026-10-25T17:00:00.000Z",
        "first_drawing_id": "200",
        "last_planned_drawing_id": "201",
        "ticket_price_ceiling_atomic": "2000000",
        "disclosure_version": "test-disclosure",
        "origin_prospective_terms_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "origin_slot_generation": 0,
        "reward_policy_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "qualification_bindings": [
          {
            "template_key": "test-template-study",
            "activity": "study",
            "grading_family": "numeric",
            "qualification_policy_id": "test-policy-study",
            "qualification_policy_hash": "286013677a9bc568cf917b7d989d7fc5ceaecdf52ac2a541953cff5efb64a23f",
            "numeric_floor_bps": 8000,
            "choreography_scope": "not_applicable",
            "admission_id": "test-admission-study",
            "admission_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "disclosure_version": "test-disclosure",
            "binding_id": "test-binding-study",
            "objective_id": "test-objective-study",
            "offer_id": "test-offer",
            "leg_id": "test-leg"
          },
          {
            "template_key": "test-template-karaoke",
            "activity": "karaoke",
            "grading_family": "numeric",
            "qualification_policy_id": "test-policy-karaoke",
            "qualification_policy_hash": "8bb20bed56f903b3816833ddaa7cb7523601fdc931282c6239c2af796e323b00",
            "numeric_floor_bps": 8000,
            "choreography_scope": "not_applicable",
            "admission_id": "test-admission-karaoke",
            "admission_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "disclosure_version": "test-disclosure",
            "binding_id": "test-binding-karaoke",
            "objective_id": "test-objective-karaoke",
            "offer_id": "test-offer",
            "leg_id": "test-leg"
          },
          {
            "template_key": "test-template-dance",
            "activity": "dance",
            "grading_family": "moderator_verdict",
            "qualification_policy_id": "test-policy-dance",
            "qualification_policy_hash": "09bc372ca82818349a65c3e50f3b03e426efd76555f321f83ef2425347573311",
            "numeric_floor_bps": null,
            "choreography_scope": "any_policy_accepted",
            "admission_id": "test-admission-dance",
            "admission_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "disclosure_version": "test-disclosure",
            "binding_id": "test-binding-dance",
            "objective_id": "test-objective-dance",
            "offer_id": "test-offer",
            "leg_id": "test-leg"
          }
        ],
        "qualification_bindings_hash": "67c2c44d13e26f106c6391cf7a7359994321d0a64c87162a8ea9165d8aadac35",
        "planned_drawing_ids": [
          "200",
          "201"
        ],
        "planned_schedule_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      },
      "binding": {
        "template_key": "test-template-dance",
        "activity": "dance",
        "grading_family": "moderator_verdict",
        "qualification_policy_id": "test-policy-dance",
        "qualification_policy_hash": "09bc372ca82818349a65c3e50f3b03e426efd76555f321f83ef2425347573311",
        "numeric_floor_bps": null,
        "choreography_scope": "any_policy_accepted",
        "admission_id": "test-admission-dance",
        "admission_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "disclosure_version": "test-disclosure",
        "binding_id": "test-binding-dance",
        "objective_id": "test-objective-dance",
        "offer_id": "test-offer",
        "leg_id": "test-leg"
      },
      "chain_id": 84532,
      "token_address": "0x1111111111111111111111111111111111111111",
      "token_decimals": 6
    }
  ]
};
