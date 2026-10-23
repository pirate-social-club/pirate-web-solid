import { createSessionApiClient, type PirateApiClient } from "./client.ts";

export function createSongContributionCatalog(client?: Pick<PirateApiClient, "get_usersMe" | "get_personas">) {
  return async (signal: AbortSignal) => {
    const sessionClient = client ?? createSessionApiClient();
    const before = await sessionClient.get_usersMe(undefined, { signal });
    const personas = await sessionClient.get_personas(undefined, { signal });
    const after = await sessionClient.get_usersMe(undefined, { signal });
    if (signal.aborted || before.id !== after.id) throw new Error("contribution_account_changed");
    return { accountId: after.id, personas: personas.personas.filter(persona => persona.status === "active" && persona.wallet_set.evm !== null) };
  };
}
export type SongContributionCatalog = Awaited<ReturnType<ReturnType<typeof createSongContributionCatalog>>>;
