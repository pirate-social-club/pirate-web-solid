import type { HnsWalletResourceRecord } from "./owner-settings-model";

export interface CommunityHnsWallet {
  isAvailable: () => boolean;
  publishCompleteResource: (rootLabel: string, records: ReadonlyArray<HnsWalletResourceRecord>) => Promise<void>;
  signRootOwnership: (rootLabel: string, message: string) => Promise<string>;
}

type BobWallet = Readonly<{
  sendUpdate: (name: string, records: ReadonlyArray<HnsWalletResourceRecord>) => Promise<void>;
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
    publishCompleteResource: async (rootLabel, records) => {
      await (await connect()).sendUpdate(rootLabel, records);
    },
  };
}
