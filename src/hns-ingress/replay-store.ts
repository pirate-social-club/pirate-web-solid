import type { HnsForwarderClockV1, HnsReplayStoreV1 } from "./wire.ts";

export const HNS_COMMUNITY_APP_SOLID_REPLAY_SCOPE =
  "pirate:hns-forwarder-v3:pirate-web-solid-community-app:v1" as const;

type ReplayStoreStub = Readonly<{
  readonly consume: (nonce: string, expiresAtUnixSeconds: number, nowUnixSeconds: number) => Promise<boolean>;
}>;

export type HnsReplayStoreNamespace = Readonly<{
  readonly getByName: (name: string) => ReplayStoreStub;
}>;

const keyIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const noncePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const scopePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;

export function makeDurableObjectHnsReplayStore(input: {
  readonly namespace: HnsReplayStoreNamespace;
  readonly consumerScope: string;
  readonly clock: HnsForwarderClockV1;
  readonly retentionSeconds: number;
}): HnsReplayStoreV1 {
  if (
    !scopePattern.test(input.consumerScope) ||
    !Number.isSafeInteger(input.retentionSeconds) ||
    input.retentionSeconds <= 0
  ) {
    throw new Error("Invalid HNS replay-store configuration");
  }
  return Object.freeze({
    consume: async (keyId: string, nonce: string): Promise<boolean> => {
      if (!keyIdPattern.test(keyId) || !noncePattern.test(nonce)) return false;
      const now = input.clock.nowUnixSeconds();
      const expiresAt = now + input.retentionSeconds;
      if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(expiresAt)) {
        throw new Error("Invalid HNS replay-store clock");
      }
      return input.namespace.getByName(`${input.consumerScope}:${keyId}`).consume(nonce, expiresAt, now);
    },
  });
}
