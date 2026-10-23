import type { SongContributionApi, SongContributionScope, SongContributionReady, SongContributionRequest, SongContributionReceipt, SongContributionState } from "./song-contributions.ts";

// Fictional in-memory application-command projections copied from api-next c9cac98e.
// No API workspace import, repository/nonce proof, provider or financial admission.

const scope = {
  "accountId": "a",
  "personaId": "persona_a",
  "communityId": "fixture-community",
  "postId": "fixture-song-post"
} as const satisfies SongContributionScope;

const context = {
  "object": "song_megapot_funding_context",
  "version": 2,
  "readiness": "ready",
  "context_hash": "7a96a22f9078c9fe45b8d1c0555f485bc4c77103fd841e01dad4aab4db65b56c",
  "context_expires_at": "2026-10-18T13:02:00.000Z",
  "lifecycle_revision": 0,
  "target": {
    "community_id": "fixture-community",
    "post_id": "fixture-song-post",
    "canonical_song_id": "fixture-canonical-song",
    "audio_revision": 1,
    "kind": "empty",
    "slot_id": "fixture-slot",
    "slot_generation": 0,
    "offer_id": null,
    "pool_leg_id": null
  },
  "actor": {
    "account_id": "a",
    "persona_id": "persona_a",
    "community_id": "fixture-community",
    "wallet_assignment_id": "wallet_persona_a",
    "wallet_index": 0,
    "sender_address": "0x1111111111111111111111111111111111111111"
  },
  "schedule": {
    "version": "song-megapot-schedule-v1",
    "rule_id": "rule",
    "rule_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "contract_code_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "anchor": {
      "chain_id": 84532,
      "block_number": "100",
      "block_hash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "block_timestamp": "2026-10-18T13:00:00.000Z",
      "observed_at": "2026-10-18T13:00:00.000Z",
      "finality_policy_id": "finality",
      "attestation_id": "attestation",
      "attestation_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    },
    "cadence_seconds": "3600",
    "price_rule_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "valid_until": "2026-10-18T13:02:00.000Z",
    "schedule_witness_id": "witness",
    "rows": [
      {
        "drawing_id": "101",
        "drawing_time": "2026-10-18T14:00:00.000Z",
        "entry_cutoff_at": "2026-10-18T13:30:00.000Z",
        "purchase_deadline_at": "2026-10-18T13:45:00.000Z",
        "price_atomic": "1000000",
        "price_ceiling_atomic": "1000000",
        "initialized": true,
        "proof_kind": "initialized_state"
      },
      {
        "drawing_id": "102",
        "drawing_time": "2026-10-18T15:00:00.000Z",
        "entry_cutoff_at": "2026-10-18T14:30:00.000Z",
        "purchase_deadline_at": "2026-10-18T14:45:00.000Z",
        "price_atomic": "1000000",
        "price_ceiling_atomic": "1000000",
        "initialized": true,
        "proof_kind": "initialized_state"
      },
      {
        "drawing_id": "103",
        "drawing_time": "2026-10-18T16:00:00.000Z",
        "entry_cutoff_at": "2026-10-18T15:30:00.000Z",
        "purchase_deadline_at": "2026-10-18T15:45:00.000Z",
        "price_atomic": "1000000",
        "price_ceiling_atomic": "1000000",
        "initialized": true,
        "proof_kind": "initialized_state"
      },
      {
        "drawing_id": "104",
        "drawing_time": "2026-10-18T17:00:00.000Z",
        "entry_cutoff_at": "2026-10-18T16:30:00.000Z",
        "purchase_deadline_at": "2026-10-18T16:45:00.000Z",
        "price_atomic": "1000000",
        "price_ceiling_atomic": "1000000",
        "initialized": true,
        "proof_kind": "initialized_state"
      },
      {
        "drawing_id": "105",
        "drawing_time": "2026-10-18T18:00:00.000Z",
        "entry_cutoff_at": "2026-10-18T17:30:00.000Z",
        "purchase_deadline_at": "2026-10-18T17:45:00.000Z",
        "price_atomic": "1000000",
        "price_ceiling_atomic": "1000000",
        "initialized": true,
        "proof_kind": "initialized_state"
      },
      {
        "drawing_id": "106",
        "drawing_time": "2026-10-18T19:00:00.000Z",
        "entry_cutoff_at": "2026-10-18T18:30:00.000Z",
        "purchase_deadline_at": "2026-10-18T18:45:00.000Z",
        "price_atomic": "1000000",
        "price_ceiling_atomic": "1000000",
        "initialized": true,
        "proof_kind": "initialized_state"
      }
    ]
  },
  "limits": {
    "profile_id": "fixture-profile",
    "minimum_atomic": "1000000",
    "maximum_atomic": "6000000",
    "usable_capacity_atomic": "6000000",
    "capacity_revision": 0,
    "max_admitted_effects_per_leg": 10,
    "remaining_effect_slots": 10,
    "account_pending_slots_available": 2,
    "fee_policy_id": "fixture-fee-policy",
    "reservation_ttl_seconds": 600,
    "latest_allocation_at": "2026-10-18T13:02:00.000Z",
    "reservation_deadline_upper_bound": "2026-10-18T13:12:00.000Z"
  },
  "chain_id": 84532,
  "token_address": "0x2222222222222222222222222222222222222222",
  "custody_address": "0x3333333333333333333333333333333333333333",
  "attestation_id": "attestation",
  "fees": {
    "inbound_payer": "selected_persona_wallet",
    "outbound_policy_id": "fixture-fee-policy",
    "gas_ready": true
  },
  "context_ref": {
    "version": "funding-context-reference-v1",
    "slot_id": "fixture-slot",
    "slot_generation": 0,
    "leg_snapshot_id": null,
    "schedule_witness_id": "witness",
    "profile_id": "fixture-profile",
    "profile_hash": "a4ed102f029f8b3f5d49ca9fe64c131c017e3471a0d388fa65bfeb4db10b97dc",
    "funding_policy_hash": "1bb42413cfc2fe292c95fcab0e62436a54199ffce08360a33d789aa12773dac6",
    "wallet_assignment_id": "wallet_persona_a",
    "wallet_assignment_revision": 1,
    "lifecycle_revision": 0
  },
  "quote": {
    "kind": "prospective",
    "prospective_terms": {
      "version": "shared-song-megapot-prospectus-v1",
      "target": {
        "community_id": "fixture-community",
        "post_id": "fixture-song-post",
        "canonical_song_id": "fixture-canonical-song",
        "audio_revision": 1
      },
      "profile_id": "fixture-profile",
      "profile_hash": "a4ed102f029f8b3f5d49ca9fe64c131c017e3471a0d388fa65bfeb4db10b97dc",
      "funding_policy_revision": 1,
      "funding_policy_hash": "1bb42413cfc2fe292c95fcab0e62436a54199ffce08360a33d789aa12773dac6",
      "reward_policy_template_hash": "a0cd51067000c5186cb2730e726f74f5c83fd854616e591f7afa0b65f54537ba",
      "start_rule": "allocation_linearization_time",
      "budget_source": "leg_budget",
      "empty_behavior": "no_purchase",
      "eligible_activities": [
        "study",
        "karaoke",
        "dance"
      ],
      "dance_scope": "any_policy_accepted",
      "qualification_templates": [
        {
          "template_key": "fixture-template-study",
          "activity": "study",
          "grading_family": "numeric",
          "qualification_policy_id": "fixture-policy-study",
          "qualification_policy_hash": "554bc9235abe7225d53bed756c3160310aad25a87f9d9b78d0ed4803c48aba54",
          "numeric_floor_bps": 7000,
          "choreography_scope": "not_applicable",
          "admission_id": "fixture-admission-study",
          "admission_hash": "70332f4dfab8eed9a2d748e63120bdf1f2f9e81fcf0fe42c167b1e6754042a88",
          "disclosure_version": "fixture-disclosure"
        },
        {
          "template_key": "fixture-template-karaoke",
          "activity": "karaoke",
          "grading_family": "numeric",
          "qualification_policy_id": "fixture-policy-karaoke",
          "qualification_policy_hash": "77daf062a46a206f001d73e762f92a436570aacc9b6cd31f6a7c904a99b4774b",
          "numeric_floor_bps": 7000,
          "choreography_scope": "not_applicable",
          "admission_id": "fixture-admission-karaoke",
          "admission_hash": "038b8168ce17be82369ef9211c2f1d9c33edf1227e05fb47e88d2365084993c9",
          "disclosure_version": "fixture-disclosure"
        },
        {
          "template_key": "fixture-template-dance",
          "activity": "dance",
          "grading_family": "moderator_verdict",
          "qualification_policy_id": "fixture-policy-dance",
          "qualification_policy_hash": "d492a8a0394e718c4ae5a8195713dc8f5392aceded39ceda00544361f189c5ce",
          "numeric_floor_bps": null,
          "choreography_scope": "any_policy_accepted",
          "admission_id": "fixture-admission-dance",
          "admission_hash": "1d81efad71c0ca76bbb80302db9171ab196c451a7215b3517bf127b1f2205f36",
          "disclosure_version": "fixture-disclosure"
        }
      ],
      "fixed_ends_at": "2026-10-18T19:00:00.000Z",
      "first_drawing_id": "101",
      "last_planned_drawing_id": "106",
      "planned_drawing_ids": [
        "101",
        "102",
        "103",
        "104",
        "105",
        "106"
      ],
      "planned_schedule_hash": "d12eabade5e1ef732861ea6d571e133aaced4390acca64c472eb159e2b77e982",
      "ticket_price_ceiling_atomic": "1000000",
      "disclosure_version": "fixture-disclosure"
    },
    "prospective_terms_hash": "2d532932a24c11a38e36dad3b0c0e5d69e7fe474bdcfc2d215d6f2080c318472"
  },
  "submission_protocol": "single_fresh_delivery_v1"
} as const satisfies SongContributionReady;

const createRequest = {
  "version": 2,
  "idempotency_key": "new_contribution_key_01",
  "persona_id": "persona_a",
  "funding_amount_atomic": "2000000",
  "expected_context_hash": "7a96a22f9078c9fe45b8d1c0555f485bc4c77103fd841e01dad4aab4db65b56c",
  "expected_lifecycle_revision": 0,
  "context_version": "funding-context-reference-v1",
  "context_slot_id": "fixture-slot",
  "context_slot_generation": 0,
  "context_leg_snapshot_id": "",
  "context_schedule_witness_id": "witness",
  "context_profile_id": "fixture-profile",
  "context_profile_hash": "a4ed102f029f8b3f5d49ca9fe64c131c017e3471a0d388fa65bfeb4db10b97dc",
  "context_funding_policy_hash": "1bb42413cfc2fe292c95fcab0e62436a54199ffce08360a33d789aa12773dac6",
  "context_wallet_assignment_id": "wallet_persona_a",
  "context_wallet_assignment_revision": 1,
  "context_lifecycle_revision": 0,
  "expected_terms_kind": "prospective",
  "expected_terms_hash": "2d532932a24c11a38e36dad3b0c0e5d69e7fe474bdcfc2d215d6f2080c318472"
} as const satisfies SongContributionRequest;

const committedTerms = {
  "version": "shared-song-megapot-v2",
  "profile_id": "fixture-profile",
  "profile_hash": "a4ed102f029f8b3f5d49ca9fe64c131c017e3471a0d388fa65bfeb4db10b97dc",
  "terms_hash": "293f6aa584e66e37b09c42c6dea29f0d6bc00a0c92fa7f592569fa1f2da945de",
  "funding_policy_revision": 1,
  "funding_policy_hash": "1bb42413cfc2fe292c95fcab0e62436a54199ffce08360a33d789aa12773dac6",
  "budget_source": "leg_budget",
  "empty_behavior": "no_purchase",
  "eligible_activities": [
    "study",
    "karaoke",
    "dance"
  ],
  "dance_scope": "any_policy_accepted",
  "starts_at": "2026-10-18T13:00:10.000Z",
  "ends_at": "2026-10-18T19:00:00.000Z",
  "first_drawing_id": "101",
  "last_planned_drawing_id": "106",
  "ticket_price_ceiling_atomic": "1000000",
  "disclosure_version": "fixture-disclosure",
  "origin_prospective_terms_hash": "2d532932a24c11a38e36dad3b0c0e5d69e7fe474bdcfc2d215d6f2080c318472",
  "origin_slot_generation": 0,
  "reward_policy_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "qualification_bindings": [
    {
      "template_key": "fixture-template-study",
      "activity": "study",
      "grading_family": "numeric",
      "qualification_policy_id": "fixture-policy-study",
      "qualification_policy_hash": "554bc9235abe7225d53bed756c3160310aad25a87f9d9b78d0ed4803c48aba54",
      "numeric_floor_bps": 7000,
      "choreography_scope": "not_applicable",
      "admission_id": "fixture-admission-study",
      "admission_hash": "70332f4dfab8eed9a2d748e63120bdf1f2f9e81fcf0fe42c167b1e6754042a88",
      "disclosure_version": "fixture-disclosure",
      "binding_id": "binding_3",
      "objective_id": "objective_4",
      "offer_id": "offer_1",
      "leg_id": "leg_2"
    },
    {
      "template_key": "fixture-template-karaoke",
      "activity": "karaoke",
      "grading_family": "numeric",
      "qualification_policy_id": "fixture-policy-karaoke",
      "qualification_policy_hash": "77daf062a46a206f001d73e762f92a436570aacc9b6cd31f6a7c904a99b4774b",
      "numeric_floor_bps": 7000,
      "choreography_scope": "not_applicable",
      "admission_id": "fixture-admission-karaoke",
      "admission_hash": "038b8168ce17be82369ef9211c2f1d9c33edf1227e05fb47e88d2365084993c9",
      "disclosure_version": "fixture-disclosure",
      "binding_id": "binding_5",
      "objective_id": "objective_6",
      "offer_id": "offer_1",
      "leg_id": "leg_2"
    },
    {
      "template_key": "fixture-template-dance",
      "activity": "dance",
      "grading_family": "moderator_verdict",
      "qualification_policy_id": "fixture-policy-dance",
      "qualification_policy_hash": "d492a8a0394e718c4ae5a8195713dc8f5392aceded39ceda00544361f189c5ce",
      "numeric_floor_bps": null,
      "choreography_scope": "any_policy_accepted",
      "admission_id": "fixture-admission-dance",
      "admission_hash": "1d81efad71c0ca76bbb80302db9171ab196c451a7215b3517bf127b1f2205f36",
      "disclosure_version": "fixture-disclosure",
      "binding_id": "binding_7",
      "objective_id": "objective_8",
      "offer_id": "offer_1",
      "leg_id": "leg_2"
    }
  ],
  "qualification_bindings_hash": "af16a018f8b4624427570f169dacecd34947f2b3705be025f74ff61cb04be2f6",
  "planned_drawing_ids": [
    "101",
    "102",
    "103",
    "104",
    "105",
    "106"
  ],
  "planned_schedule_hash": "d12eabade5e1ef732861ea6d571e133aaced4390acca64c472eb159e2b77e982"
} as const satisfies SongContributionReceipt["committed_terms"];

const receipt = {
  "object": "song_megapot_contribution_command_receipt",
  "version": 2,
  "command_id": "command_13",
  "request_hash": "00b557ada89163a27740312871818a64df648a39aa02c1ce9f134d75f5309d39",
  "idempotency_key": "new_contribution_key_01",
  "created_at": "2026-10-18T13:00:10.000Z",
  "contribution_id": "contribution_9",
  "funding_effect_id": "effect_10",
  "target": {
    "community_id": "fixture-community",
    "post_id": "fixture-song-post",
    "canonical_song_id": "fixture-canonical-song",
    "audio_revision": 1,
    "kind": "committed",
    "offer_id": "offer_1",
    "pool_leg_id": "leg_2"
  },
  "persona_id": "persona_a",
  "terms_hash": "293f6aa584e66e37b09c42c6dea29f0d6bc00a0c92fa7f592569fa1f2da945de",
  "reservation": {
    "reservation_id": "reservation_11",
    "revision": 0,
    "amount_atomic": "2000000",
    "valid_from_block_exclusive": "100",
    "deadline": "2026-10-18T13:10:10.000Z",
    "disposition_rule_id": "receipt-chain-time-v3",
    "nonce_lease_id": "shared_nonce_lease_12"
  },
  "instruction": {
    "kind": "erc20_transfer",
    "instruction_hash": "58f435b1a7aa3d90f6f644ffcc9158c40c3f4c8f329f7fc927b98120ef9b0979",
    "chain_id": 84532,
    "attestation_id": "attestation",
    "attestation_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "from": "0x1111111111111111111111111111111111111111",
    "to_token": "0x2222222222222222222222222222222222222222",
    "recipient_custody": "0x3333333333333333333333333333333333333333",
    "value_atomic": "0",
    "amount_atomic": "2000000",
    "nonce": "7",
    "calldata": "0xa9059cbb000000000000000000000000333333333333333333333333333333333333333300000000000000000000000000000000000000000000000000000000001e8480",
    "wallet_assignment_id": "wallet_persona_a",
    "wallet_index": 0,
    "expires_at": "2026-10-18T13:10:10.000Z"
  },
  "current_state_href": "/communities/fixture-community/posts/fixture-song-post/megapot-contributions/contribution_9",
  "observation_href": "/communities/fixture-community/posts/fixture-song-post/megapot-contributions/contribution_9/observations",
  "recovery_href": "/communities/fixture-community/posts/fixture-song-post/megapot-contributions/contribution_9/recoveries",
  "accepted_context_hash": "7a96a22f9078c9fe45b8d1c0555f485bc4c77103fd841e01dad4aab4db65b56c",
  "accepted_prospective_terms_hash": "2d532932a24c11a38e36dad3b0c0e5d69e7fe474bdcfc2d215d6f2080c318472",
  committed_terms: committedTerms
} as const satisfies SongContributionReceipt;

const current = {
  "object": "song_megapot_contribution_state",
  "version": 2,
  "contribution_id": "contribution_9",
  "funding_effect_id": "effect_10",
  "revision": 0,
  "state": "instruction_issued",
  "nonce_state": "unresolved",
  "disposition": "unresolved",
  "target": {
    "community_id": "fixture-community",
    "post_id": "fixture-song-post",
    "canonical_song_id": "fixture-canonical-song",
    "audio_revision": 1,
    "kind": "committed",
    "offer_id": "offer_1",
    "pool_leg_id": "leg_2"
  },
  "original_persona_id": "persona_a",
  "original_sender": "0x1111111111111111111111111111111111111111",
  "terms_hash": "293f6aa584e66e37b09c42c6dea29f0d6bc00a0c92fa7f592569fa1f2da945de",
  "instruction_hash": "58f435b1a7aa3d90f6f644ffcc9158c40c3f4c8f329f7fc927b98120ef9b0979",
  "receipt_evidence": null,
  "pool_credit_atomic": "0",
  "late_principal_owed_atomic": "0",
  "refund_paid_atomic": "0",
  "reservation_capacity_state": "reserved",
  "cohort_seal_id": null,
  "allowed_actions": [
    "observe_original",
    "recover_original",
    "wait"
  ],
  "pause_reason": null,
  "updated_at": "2026-10-18T13:00:10.000Z",
  "submissions": [],
  "cancellation": {
    "object": "contribution_cancellation_preparation_state",
    "state": "not_prepared",
    "preparations_used": 0,
    "current_preparation_id": null,
    "current_preparation_revision": 0,
    "current_receipt": null
  },
  command_receipt: receipt
} as const satisfies SongContributionState;

const claimRequest = {
  "idempotency_key": "claim_submission_key_01",
  "client_instance_id": "client_instance_one",
  "submission_attempt_id": "submission_attempt_one",
  "purpose": "funding_transfer",
  "expected_state_revision": 0,
  "instruction_hash": "58f435b1a7aa3d90f6f644ffcc9158c40c3f4c8f329f7fc927b98120ef9b0979"
} as const satisfies Parameters<SongContributionApi["claim"]>[1];

const claim = {
  "receipt": {
    "object": "contribution_submission_claim_receipt",
    "version": 2,
    "command_id": "command_14",
    "request_hash": "8cc511532663d82137a67da4a1b38de8d14c9930f6f078cb6d899dbafb805b8d",
    "contribution_id": "contribution_9",
    "instruction_hash": "58f435b1a7aa3d90f6f644ffcc9158c40c3f4c8f329f7fc927b98120ef9b0979",
    "purpose": "funding_transfer",
    "grant_id": "grant_15",
    "grant_revision": 1,
    "holder_client_instance_id": "client_instance_one",
    "submission_attempt_id": "submission_attempt_one",
    "claimed_at": "2026-10-18T13:00:10.000Z",
    "valid_until": "2026-10-18T13:10:10.000Z",
    "current_state_href": "/communities/fixture-community/posts/fixture-song-post/megapot-contributions/contribution_9",
    "cancellation_preparation_id": null,
    "cancellation_preparation_revision": null
  },
  "delivery": {
    "kind": "fresh_grant",
    "replayed": false
  }
} as const satisfies Awaited<ReturnType<SongContributionApi["claim"]>>;

const claimReplay = { ...claim, delivery: { kind: "recovery_only", replayed: true } } as const satisfies Awaited<ReturnType<SongContributionApi["claim"]>>;

const observationRequest = {
  "idempotency_key": "observation_key_0001",
  "instruction_hash": "58f435b1a7aa3d90f6f644ffcc9158c40c3f4c8f329f7fc927b98120ef9b0979",
  "transaction_hash": "0xabababababababababababababababababababababababababababababababab"
} as const satisfies Parameters<SongContributionApi["observe"]>[1];

const observation = {
  "version": 2,
  "command_id": "command_16",
  "request_hash": "e5f26589f0512061f936be3cdb76bbb63b19e713efb5649058af9779dff64115",
  "contribution_id": "contribution_9",
  "current_state_href": "/communities/fixture-community/posts/fixture-song-post/megapot-contributions/contribution_9",
  "object": "contribution_observation_command_receipt",
  "accepted_candidate_hash": "0xabababababababababababababababababababababababababababababababab"
} as const satisfies Awaited<ReturnType<SongContributionApi["observe"]>>;

const recoveryRequest = {
  "idempotency_key": "recover_original_key_01",
  "expected_state_revision": 1,
  "purpose": "reconcile_original"
} as const satisfies Parameters<SongContributionApi["recover"]>[1];

const recovery = {
  "version": 2,
  "command_id": "command_17",
  "request_hash": "fd3202966fb3b16bf5b389429c15659dcaaab5b85fa615b4a71224edea55184d",
  "contribution_id": "contribution_9",
  "current_state_href": "/communities/fixture-community/posts/fixture-song-post/megapot-contributions/contribution_9",
  "object": "contribution_recovery_command_receipt",
  "work_item_id": "work_18",
  "semantics": "reconcile_only_no_send"
} as const satisfies Awaited<ReturnType<SongContributionApi["recover"]>>;

const cancellationRequest = {
  "idempotency_key": "cancellation_plan_key_01",
  "expected_state_revision": 1,
  "purpose": "cancel_original_nonce"
} as const satisfies Parameters<SongContributionApi["cancellation"]>[1];

const cancellation = {
  "object": "contribution_cancellation_command_receipt",
  "version": 2,
  "command_id": "command_19",
  "request_hash": "08e8125e187ea153f578076ff20770e90ba14f2b4ae5335c1af1d8f02ba6755d",
  "contribution_id": "contribution_9",
  "chain_id": 84532,
  "sender": "0x1111111111111111111111111111111111111111",
  "recipient": "0x1111111111111111111111111111111111111111",
  "nonce": "7",
  "value_atomic": "0",
  "data": "0x",
  "instruction_hash": "5cdda95111b40165da492b61fdcea08e81849d79e977d42b664a9f70c2bddf64",
  "current_state_href": "/communities/fixture-community/posts/fixture-song-post/megapot-contributions/contribution_9",
  "purpose": "nonce_cancellation",
  "preparation_id": "cancellation_plan_20",
  "preparation_revision": 1,
  "previous_preparation_id": null,
  "previous_preparation_instruction_hash": null,
  "prepared_state_revision": 2,
  "prepared_at": "2026-10-18T14:20:00.000Z",
  "dispatch_expires_at": "2026-10-18T14:23:00.000Z",
  "original_funding_instruction_hash": "58f435b1a7aa3d90f6f644ffcc9158c40c3f4c8f329f7fc927b98120ef9b0979",
  "recovery_policy_id": "fixture-recovery-policy",
  "recovery_policy_hash": "aac2afb21c6adb4dd242ee7273d692f0087813ff96ab8956b5d7b7f18a46030b",
  "recovery_attestation_id": "recovery_attestation",
  "recovery_attestation_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "recovery_attestation_valid_until": "2026-10-18T16:00:00.000Z",
  "fee_policy_id": "fixture-fee-policy",
  "fee_policy_hash": "7246b3571ad5228ea98f410d9947ef7c31f9a99463d0bd1ae17df0ad7428a4c9",
  "wallet_assignment_id": "wallet_persona_a",
  "wallet_index": 0
} as const satisfies Awaited<ReturnType<SongContributionApi["cancellation"]>>;

export const contributionFixtures = { scope, context, createRequest, receipt, current, claimRequest, claim, claimReplay, observationRequest, observation, recoveryRequest, recovery, cancellationRequest, cancellation };
