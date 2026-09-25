import type { PostPersonasPersonaIdWalletsSpacesTaprootStatusResponse } from "@pirate/api-client";
import { createSessionSpacesTaprootClient, handleSalesMutationOptions, type SessionSpacesTaprootApiClient } from "./handle-sales-client.ts";
import { defaultPrivyFactory, MemoryOnlyStorage, type PrivyAuthClient, type PrivyFactory } from "./privy-session.ts";
import { fetchVerificationConfig } from "./verification-config.ts";
import type { VerificationPublicConfig } from "./verification-config.ts";

type WalletStatus = PostPersonasPersonaIdWalletsSpacesTaprootStatusResponse;
type WalletResult = Extract<WalletStatus, { kind: "active" | "pending" | "ambiguous" | "prepared" }>;

export interface SpacesTaprootWalletSession {
  sendCode(email: string): Promise<void>;
  loginWithCode(email: string, code: string): Promise<void>;
  status(personaId: string, csrf: string): Promise<WalletStatus>;
  setup(personaId: string, csrf: string): Promise<WalletResult>;
  dispose(): void;
}

/** A fresh, memory-only Privy authorization. It never replaces the app cookie. */
export async function createSpacesTaprootWalletSession(options: {
  readonly factory?: PrivyFactory;
  readonly apiClient?: SessionSpacesTaprootApiClient;
  readonly config?: VerificationPublicConfig;
} = {}): Promise<SpacesTaprootWalletSession> {
  const storage = new MemoryOnlyStorage();
  const client: PrivyAuthClient = await (options.factory ?? defaultPrivyFactory)(
    options.config ?? await fetchVerificationConfig(), storage,
  );
  try { await client.initialize(); }
  catch (error) { storage.clear(); client.dispose?.(); throw error; }
  const api = options.apiClient ?? createSessionSpacesTaprootClient();
  let disposed = false;
  let authorized = false;
  let creating = false;
  const alive = () => { if (disposed) throw new Error("wallet_session_closed"); };
  const proof = async () => {
    alive();
    if (!authorized) throw new Error("wallet_reauthentication_required");
    const accessToken = await client.getAccessToken();
    alive();
    if (accessToken === null || accessToken === "") throw new Error("wallet_reauthentication_required");
    return { type: "privy_access_token" as const, privy_access_token: accessToken };
  };
  const status = async (personaId: string, csrf: string): Promise<WalletStatus> =>
    api.post_personasPersonaIdWalletsSpacesTaprootStatus(
      { path: { personaId }, body: { proof: await proof() } },
      handleSalesMutationOptions(csrf),
    );
  const finishCandidate = async (
    personaId: string, csrf: string, candidate: Extract<WalletStatus, { kind: "candidate" }>,
  ): Promise<WalletResult> => {
    if (client.signEmbeddedTaprootHash === undefined) throw new Error("wallet_signing_unavailable");
    const signatureHex = await client.signEmbeddedTaprootHash(
      candidate.provider_wallet_id, candidate.challenge_digest_hex,
    );
    await api.post_personasPersonaIdWalletsSpacesTaprootConfirm(
      { path: { personaId }, body: {
        proof: await proof(), assignment_id: candidate.assignment_id,
        provider_wallet_id: candidate.provider_wallet_id, signature_hex: signatureHex,
      } },
      handleSalesMutationOptions(csrf),
    );
    const confirmed = await status(personaId, csrf);
    if (confirmed.kind !== "active" || confirmed.assignment_id !== candidate.assignment_id ||
      confirmed.provider_wallet_id !== candidate.provider_wallet_id) throw new Error("wallet_confirmation_uncertain");
    return confirmed;
  };
  return {
    async sendCode(email) {
      alive();
      const result = await client.auth.email.sendCode(email);
      alive();
      if (!result.success) throw new Error("wallet_auth_failed");
    },
    async loginWithCode(email, code) {
      alive();
      await client.auth.email.loginWithCode(email, code);
      alive();
      authorized = true;
    },
    status,
    async setup(personaId, csrf) {
      alive();
      if (creating) throw new Error("wallet_creation_in_progress");
      const prepared = await api.post_personasPersonaIdWalletsSpacesTaprootPrepare(
        { path: { personaId }, body: { proof: await proof(), idempotency_key: crypto.randomUUID() } },
        handleSalesMutationOptions(csrf),
      );
      if (prepared.may_create) {
        if (client.addEmbeddedTaprootWallet === undefined) throw new Error("wallet_creation_unavailable");
        // The provider's add call is not idempotent. An error is uncertain; never retry it here.
        creating = true;
        await client.addEmbeddedTaprootWallet();
      }
      const result = await status(personaId, csrf);
      if (result.assignment_id !== prepared.assignment_id) throw new Error("wallet_assignment_changed");
      return result.kind === "candidate" ? finishCandidate(personaId, csrf, result) : result;
    },
    dispose() { disposed = true; authorized = false; storage.clear(); client.dispose?.(); },
  };
}
