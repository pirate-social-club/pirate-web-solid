import {
  ApiClientError,
  type GetMeAgeVerificationResponse,
  type PirateApiClient,
} from "@pirate/api-client";
import { createSessionApiClient } from "../../api/client.ts";
import { onSessionRefreshed } from "../../api/session.ts";
import { requestGlobalSignInCompletion } from "../auth/global-sign-in-host.tsx";
import {
  DocumentRequirementError,
  pendingDocumentRequirement,
  type DocumentRequirement,
} from "./document-requirement.ts";
import { requestDocumentVerification } from "./document-verification-host.tsx";

export function ageDocumentRequirement(
  response: GetMeAgeVerificationResponse,
): DocumentRequirement {
  if (response.status === "verified") return { kind: "satisfied" };
  if (response.status !== "verification_required") throw new DocumentRequirementError();
  return pendingDocumentRequirement({
    requirement: "age_18",
    requirementHash: response.requirement_hash,
    intentId: response.ceremony_intent_id,
    providerId: response.provider_id,
    acceptedProviderIds: response.accepted_provider_ids,
    generation: response.generation,
  });
}
export interface AgeVerificationDependencies {
  readonly client?: Pick<PirateApiClient, "get_usersMe" | "get_meAgeVerification">;
  readonly signIn?: typeof requestGlobalSignInCompletion;
  readonly verify?: typeof requestDocumentVerification;
  readonly subscribe?: typeof onSessionRefreshed;
}
/** Every poll remains account-bound. No capability, document data or return target is persisted. */
export async function verifyAdultViewing(
  signal: AbortSignal,
  dependencies: AgeVerificationDependencies = {},
): Promise<boolean> {
  if (signal.aborted) return false;
  const operation = new AbortController();
  const cancel = () => operation.abort();
  signal.addEventListener("abort", cancel, { once: true });
  let unsubscribe: (() => void) | undefined;
  const client = dependencies.client ?? createSessionApiClient();
  try {
    let account: string;
    try {
      account = (await client.get_usersMe(undefined, { signal: operation.signal })).id;
    } catch (error) {
      if (!(error instanceof ApiClientError) || error.status !== 401) throw error;
      if (!(await (dependencies.signIn ?? requestGlobalSignInCompletion)(operation.signal)))
        return false;
      account = (await client.get_usersMe(undefined, { signal: operation.signal })).id;
    }
    if (operation.signal.aborted) return false;
    unsubscribe = (dependencies.subscribe ?? onSessionRefreshed)(cancel);
    return (
      (await (dependencies.verify ?? requestDocumentVerification)({
        title: "Verify you are 18 or older",
        signal: operation.signal,
        load: async (nextSignal) => {
          const current = await client.get_usersMe(undefined, { signal: nextSignal });
          if (current.id !== account || operation.signal.aborted) {
            cancel();
            throw new DocumentRequirementError();
          }
          const authority = await client.get_meAgeVerification(undefined, { signal: nextSignal });
          if (operation.signal.aborted) throw new DocumentRequirementError();
          return ageDocumentRequirement(authority);
        },
      })) && !operation.signal.aborted
    );
  } finally {
    unsubscribe?.();
    signal.removeEventListener("abort", cancel);
    operation.abort();
  }
}
