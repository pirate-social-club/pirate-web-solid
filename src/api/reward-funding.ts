import { createRewardFundingApi, type RewardFundingActor, type RewardFundingTarget } from "./reward-funding-client.ts";
import { createRewardFundingController } from "./reward-funding-controller.ts";
import { createBrowserRewardFundingRecovery } from "./reward-funding-recovery.ts";
import { createRewardWalletSession } from "./reward-wallet-session.ts";
import type { VerificationPublicConfig } from "./verification-config.ts";

/** Browser-only composition for the sponsor UI; construction never signs or authenticates. */
export async function createBrowserRewardFunding(options: {
  readonly config: VerificationPublicConfig;
  readonly actor: RewardFundingActor;
  readonly target: RewardFundingTarget;
  readonly currentActor: () => RewardFundingActor | null;
}) {
  const actor = Object.freeze({ ...options.actor });
  const target = Object.freeze({ ...options.target });
  const recovery = createBrowserRewardFundingRecovery();
  const api = createRewardFundingApi();
  const wallet = await createRewardWalletSession(options.config);
  const controller = createRewardFundingController({ actor, target, currentActor: options.currentActor, api, wallet, recovery });
  const assertActor = () => {
    const current = options.currentActor();
    if (current?.accountId !== actor.accountId || current.personaId !== actor.personaId) {
      controller.dispose(); throw new Error("funding_actor_changed");
    }
  };
  try { assertActor(); } catch (error) { controller.dispose(); throw error; }
  return {
    controller,
    authorization: {
      sendCode: wallet.sendCode, loginWithCode: wallet.loginWithCode,
      beginOAuth: wallet.beginOAuth, completeOAuth: wallet.completeOAuth,
      loginWithWallet: wallet.loginWithWallet,
    },
    async selectTestnet() {
      assertActor();
      const context = await api.load(target, actor);
      assertActor();
      await wallet.selectTestnet(context);
      assertActor();
    },
    dispose: controller.dispose,
  };
}
