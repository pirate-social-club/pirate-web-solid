import type { RewardFundingActor, RewardFundingTarget } from "./reward-funding-client.ts";

export interface RewardFundingReceipt {
  readonly version: 1;
  readonly instructionDigest: string;
  readonly observationKey: string;
  readonly transactionHash: string | null;
}
export interface RewardFundingRecovery {
  read(key: string): RewardFundingReceipt | null;
  write(key: string, receipt: RewardFundingReceipt): void;
  remove(key: string): void;
  exclusive<T>(key: string, operation: () => Promise<T>): Promise<T>;
}
export function rewardFundingRecoveryKey(actor: RewardFundingActor, target: RewardFundingTarget): string {
  return `pirate:reward-funding:v1:${JSON.stringify([actor.accountId, actor.personaId, target.kind, target.legId, target.fundingEffectId])}`;
}
function decodeReceipt(raw: string): RewardFundingReceipt {
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new Error("funding_recovery_corrupt"); }
  if (value === null || typeof value !== "object" || !("version" in value) || value.version !== 1 ||
      !("instructionDigest" in value) || typeof value.instructionDigest !== "string" || !/^[0-9a-f]{64}$/u.test(value.instructionDigest) ||
      !("observationKey" in value) || typeof value.observationKey !== "string" || !/^[0-9a-f-]{36}$/u.test(value.observationKey) ||
      !("transactionHash" in value) || !(value.transactionHash === null ||
        typeof value.transactionHash === "string" && /^0x[0-9a-f]{64}$/u.test(value.transactionHash))) {
    throw new Error("funding_recovery_corrupt");
  }
  return { version: 1, instructionDigest: value.instructionDigest, observationKey: value.observationKey, transactionHash: value.transactionHash };
}

/** Persists identifiers only. Web Locks serialize the same economic effect across tabs. */
export function createBrowserRewardFundingRecovery(): RewardFundingRecovery {
  if (typeof window === "undefined" || typeof navigator === "undefined" || navigator.locks === undefined) {
    throw new Error("funding_durable_recovery_unavailable");
  }
  const storage = window.localStorage;
  const locks = navigator.locks;
  return {
    read(key) {
      const raw = storage.getItem(key);
      return raw === null ? null : decodeReceipt(raw);
    },
    write(key, receipt) {
      const raw = JSON.stringify(receipt);
      decodeReceipt(raw);
      storage.setItem(key, raw);
      if (storage.getItem(key) !== raw) throw new Error("funding_recovery_write_failed");
    },
    remove(key) {
      storage.removeItem(key);
      if (storage.getItem(key) !== null) throw new Error("funding_recovery_write_failed");
    },
    async exclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
      return await locks.request(key, { mode: "exclusive" }, operation);
    },
  };
}
