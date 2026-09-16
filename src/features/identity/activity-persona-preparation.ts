import {
  ApiClientError,
  createPirateApiClient,
  type PirateApiClient,
  type PostCommunitiesCommunityIdActivityPersonasPrepareResponse,
} from "@pirate/api-client";

import { createGeneratedApiClient, readCsrfCookie, sessionRequestOptions } from "../../api/client";
import type { ApiFetch } from "../../api/proxy";
import type { ActivePersonaPublicProjection } from "../../api/session";
import {
  communityOperationPersonas,
  toCommunityPersonaChoiceWire,
  type CommunityPersonaChoice,
} from "./community-persona-choice";

export type ActivityPersonaPreparation =
  PostCommunitiesCommunityIdActivityPersonasPrepareResponse;

type PreparationGeneratedClient = Pick<
  PirateApiClient,
  "post_communitiesCommunityIdActivityPersonasPrepare"
>;

export interface ActivityPersonaPreparationApiOptions {
  /** Test seam. Production uses the generated client through the same-origin Worker proxy. */
  client?: PreparationGeneratedClient;
  fetchImpl?: ApiFetch;
  origin?: string | URL;
  readCsrfToken?: () => string | undefined;
}

export interface ActivityPersonaPreparationApi {
  prepare(input: {
    communityId: string;
    idempotencyKey: string;
    choice: CommunityPersonaChoice;
    signal?: AbortSignal;
  }): Promise<ActivityPersonaPreparation>;
}

export class ActivityPersonaPreparationLocalError extends Error {
  readonly code: "csrf_required";

  constructor(code: ActivityPersonaPreparationLocalError["code"], message: string) {
    super(message);
    this.name = "ActivityPersonaPreparationLocalError";
    this.code = code;
  }
}

/**
 * Explicit activity preparation before any join (spec 014 section 11.2). The
 * server selects or binds one of the account's active personas, or mints a
 * pending_wallet persona born bound to the community; the browser never
 * invents an identity and never infers admission from a binding.
 */
export function createActivityPersonaPreparationApi(
  options: ActivityPersonaPreparationApiOptions = {},
): ActivityPersonaPreparationApi {
  let generatedClient = options.client;
  const client = (): PreparationGeneratedClient => {
    generatedClient ??= createGeneratedApiClient(
      createPirateApiClient,
      { fetchImpl: options.fetchImpl, origin: options.origin },
      { credentials: "same-origin" },
    );
    return generatedClient;
  };
  const csrfToken = options.readCsrfToken ?? readCsrfCookie;
  return {
    async prepare(input) {
      const token = csrfToken();
      if (token === undefined) {
        throw new ActivityPersonaPreparationLocalError(
          "csrf_required",
          "Sign in again, then retry activity entry.",
        );
      }
      return await client().post_communitiesCommunityIdActivityPersonasPrepare(
        {
          body: {
            choice: toCommunityPersonaChoiceWire(input.choice),
            idempotency_key: input.idempotencyKey,
          },
          path: { communityId: input.communityId },
        },
        {
          ...sessionRequestOptions(token),
          ...(input.signal === undefined ? {} : { signal: input.signal }),
        },
      );
    },
  };
}

/**
 * Unbound active personas are the only existing identities preparation may
 * bind; a bound persona already carries the community it can present in.
 */
export function activityPreparationCandidates(
  personas: readonly ActivePersonaPublicProjection[],
): readonly ActivePersonaPublicProjection[] {
  return personas.filter((persona) => persona.communityBinding === null);
}

/**
 * The unambiguous preparation choice, or undefined when the account has both
 * an eligible persona (nothing to prepare) or several unbound candidates that
 * the user must choose between. Never returns the global first persona.
 */
export function activityPreparationChoice(
  personas: readonly ActivePersonaPublicProjection[],
  communityId: string,
): CommunityPersonaChoice | undefined {
  if (communityOperationPersonas(personas, communityId).length > 0) return undefined;
  const candidates = activityPreparationCandidates(personas);
  if (candidates.length === 0) return { kind: "create_new" };
  if (candidates.length === 1) return { kind: "existing", personaId: candidates[0]!.personaId };
  return undefined;
}

/**
 * A prepared persona is activity-admissible only once it is active; the
 * pending_wallet result follows the ordinary additional-persona wallet
 * confirmation before any activity command accepts it.
 */
export function activityPreparationAdmissible(preparation: ActivityPersonaPreparation): boolean {
  return preparation.persona_status === "active";
}

export function activityPreparationMessage(error: unknown): string {
  if (error instanceof ActivityPersonaPreparationLocalError) {
    return "Sign in again, then retry activity entry.";
  }
  if (error instanceof ApiClientError) {
    if (error.status === 401 || error.status === 403) {
      return "Sign in to set up activity entry.";
    }
    if (error.status === 404) {
      return "That identity is not available for this community. Refresh and choose again.";
    }
    if (error.status === 409) {
      return "That identity is already bound to another community. Refresh and try another persona.";
    }
    if (error.status === 429) {
      return "Too many attempts. Wait a moment, then try again.";
    }
  }
  return "We couldn't prepare your activity identity. Retry before starting.";
}
