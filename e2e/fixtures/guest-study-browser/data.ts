import type { GuestAuthority, GuestStudySession, GuestStudyAnswerResult } from "../../../src/features/studying/guest-study-api.ts";
import { guestSession, prepared } from "../../../src/features/studying/guest-study-test-fixtures.ts";
export { prepared };
export const ownerId = "100", credentialId = "200";
// Synthetic public fixture values only, never managed credentials.
export const csrf = "A".repeat(43), proof = `${"B".repeat(42)}A`;
export const proofCookie = `__Host-pirate_guest_${credentialId}`;
export function authority(state: "absent" | "pending" | "confirmed"): GuestAuthority {
  const selected = state === "absent" ? null : { owner_id: ownerId, credential_id: credentialId,
    credential_state: state === "pending" ? "pending_bootstrap" as const : "confirmed" as const,
    session_until: state === "pending" ? null : new Date(Date.now() + 3_600_000).toISOString() };
  return { object: "guest_authority", state, selected, pointer_repair: null, proved_credentials: selected === null ? [] : [selected] };
}
export function initialSession(): GuestStudySession {
  const existing = guestSession();
  const created = new Date().toISOString();
  return guestSession({ created_at: created, expires_at: new Date(Date.parse(created) + 86_400_000).toISOString(),
    languages: { learning_language: "en", target_language: "ar" }, learner_band: "A1",
    lesson: { ...existing.lesson, presentation_cap: 12 },
    items: existing.items.map((item): GuestStudySession["items"][number] => ({ ...item, exercise_type: "translation_choice", exercise_variant: "single-select-v1",
      answer_visibility: "secret_until_spent", feedback_release: "spent_only",
      languages: { learning_language: "en", target_language: "ar" }, learner_band: "A1",
      line: { ...item.line, line_source_hash: "a".repeat(64) },
      presentation: { kind: "translation_choice", capture: "choice_selection", source_text: `Line ${item.ordinal + 1}`,
        question: "Choose the translation", choices: [{ choice_key: "one", text: "Answer one" }, { choice_key: "two", text: "Answer two" }] },
    })),
  });
}
export function firstAnswer(session: GuestStudySession): GuestStudyAnswerResult {
  const next = { ...session, progress: { ...session.progress, answered_exercise_count: 1, first_pass_correct: 1 },
    lesson: { ...session.lesson, resolved_card_count: 1, presentation_count: 2, current: {
      session_item_id: "item-2", presentation_number: 2, is_reappearance: false, presented_at: new Date().toISOString(),
    } } };
  return { object: "guest_study_answer_result_v1", session_item_id: "item-1", attempt_number: 1,
    exercise_type: "translation_choice", first_pass: true, attempt_state: "spent", outcome: "correct",
    feedback: { kind: "choice_reveal", correct_choice_key: "one", correct_text: "Answer one" },
    session: next, participation: { state: "practice_only" } };
}
