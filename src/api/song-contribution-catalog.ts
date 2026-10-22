import { createSessionApiClient, type PirateApiClient } from "./client.ts";

export function createSongContributionCatalog(client: Pick<PirateApiClient, "get_usersMe" | "get_personas"> = createSessionApiClient()) {
  return async (signal: AbortSignal) => {
    const before = await client.get_usersMe(undefined, { signal });
    const personas = await client.get_personas(undefined, { signal });
    const after = await client.get_usersMe(undefined, { signal });
    if (signal.aborted || before.id !== after.id) throw new Error("contribution_account_changed");
    return { accountId: after.id, personas: personas.personas.filter(persona => persona.status === "active" && persona.wallet_set.evm !== null) };
  };
}
export type SongContributionCatalog = Awaited<ReturnType<ReturnType<typeof createSongContributionCatalog>>>;
