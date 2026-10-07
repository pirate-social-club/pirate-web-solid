import type { HnsWalletResourceRecord } from "./owner-settings-model";

interface ConnectedHnsPublicationWallet {
  publishCompleteResource: (rootLabel: string, records: ReadonlyArray<HnsWalletResourceRecord>) => Promise<Readonly<{ txid: string | null }>>;
}

export interface CommunityHnsWallet {
  isAvailable: () => boolean;
  connectForPublication: () => Promise<ConnectedHnsPublicationWallet>;
  signRootOwnership: (rootLabel: string, message: string) => Promise<string>;
}

type BobWallet = Readonly<{
  sendUpdate: (name: string, records: ReadonlyArray<HnsWalletResourceRecord>) => Promise<Readonly<{ hash: string }> | null | undefined>;
  signWithName: (name: string, message: string) => Promise<string>;
}>;

type BobProvider = Readonly<{ connect: () => Promise<BobWallet> }>;
export type BobBrowserScope = Readonly<{ bob3?: BobProvider }>;

function browserScope(): BobBrowserScope {
  // SAFETY: The injected provider remains optional and is checked before use.
  return globalThis as BobBrowserScope;
}

export function createBobCommunityHnsWallet(target: BobBrowserScope = browserScope()): CommunityHnsWallet {
  const connect = async (): Promise<BobWallet> => {
    const provider = target.bob3;
    if (!provider) throw new Error("bob_wallet_unavailable");
    return provider.connect();
  };

  return {
    isAvailable: () => target.bob3 !== undefined,
    signRootOwnership: async (rootLabel, message) => {
      const signature = await (await connect()).signWithName(rootLabel, message);
      if (signature.trim().length === 0) throw new Error("bob_wallet_signature_invalid");
      return signature;
    },
    connectForPublication: async () => {
      const wallet = await connect();
      return { publishCompleteResource: async (rootLabel, records) => {
        // Bob resolves sendUpdate with hsd transaction JSON after submission.
        // An absent/malformed hash is an ambiguous completion, never permission to resend.
        const result = await wallet.sendUpdate(rootLabel, records);
        const hash = typeof result === "object" && result !== null && "hash" in result ? result.hash : null;
        return { txid: typeof hash === "string" && /^[a-fA-F0-9]{64}$/.test(hash) ? hash.toLowerCase() : null };
      } };
    },
  };
}
