import type { PirateApiClient } from "../../api/client.ts";
import type { WalletHubChainSection } from "./wallet-hub.types.ts";

export interface PersonaWallet {
  personaId: string;
  displayName: string;
  publicHandle: string | null;
  avatarSrc: string | null;
  address: string | null;
}

/** Account-private endpoint only; no wallet fields enter the public persona projection. */
export async function loadPersonaWallets(client: Pick<PirateApiClient, "get_personas">): Promise<readonly PersonaWallet[]> {
  const response = await client.get_personas(undefined);
  return response.personas.filter(persona => persona.status === "active").map(persona => ({
    personaId: persona.persona_id,
    displayName: persona.profile.display_name ?? persona.profile.primary_public_handle ?? "Profile",
    publicHandle: persona.profile.primary_public_handle,
    avatarSrc: persona.profile.avatar_ref,
    address: persona.wallet_set.evm?.address ?? null,
  }));
}

export function walletReceiveNetworks(address: string | null): WalletHubChainSection[] {
  return ([
    ["ethereum", "Ethereum"], ["data", "DATA Network"], ["base", "Base"],
  ] as const).map(([chainId, title]) => ({
    chainId, title, availability: "ready", walletAddress: address,
    tokens: [], balancesUnavailable: true,
  }));
}
