import type { SponsoredSendRecord } from "../../api/reward-sponsored-send.ts";
import type { SponsoredSendDependencies } from "./sponsored-send-sheet.tsx";
import { fixtureSender } from "./winnings-send.fixtures.ts";

export const sponsoredFixtureRecord: SponsoredSendRecord = {
  object: "reward_sponsored_send", send_id: "sponsored_story", credit_id: "sent",
  status: "reserved", chain_id: 84532, sender_address: fixtureSender,
  recipient_address: "0x9b8a7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b",
  amount_atomic: "12500000", transaction_hash: null,
  authorization: { wallet_id: "wallet_story", payload_base64: "cGF5bG9hZA==" },
};

export function sponsoredFixture(initial: SponsoredSendRecord | null = null): SponsoredSendDependencies {
  let record = initial;
  return {
    data: {
      async sender() { return { address: fixtureSender, walletIndex: 0 }; },
      async tokenBalance() { return 12_500_000n; },
      async readDirectSend() { return null; },
      async read() { return record; },
      async reserve(_creditId, recipient, amountAtomic) {
        record = { ...sponsoredFixtureRecord, recipient_address: recipient.toLowerCase(), amount_atomic: amountAtomic };
        return record;
      },
      async submit() {
        record = { ...record!, status: "submitted", authorization: null };
        return record;
      },
    },
    openWallet: async () => ({
      restoreAuthorization: async () => true,
      signSponsoredRequest: async () => "c2lnbmF0dXJl",
      dispose: () => {},
    }),
  };
}
