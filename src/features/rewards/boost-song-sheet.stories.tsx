import type { Meta, StoryObj } from "storybook-solidjs-vite";

import type { BoostDraft, BoostState } from "./boost-song-model";
import { BoostSongSheet, type BoostSongSheetProps } from "./boost-song-sheet";

const noop = () => {};
const presets = ["10.00", "25.00", "50.00"];

const bonusDraft: BoostDraft = {
  kind: "asset_bonus",
  budgetLabel: "10.00",
  rewardPerClaimLabel: "1.00",
  activity: "either",
  tokenSymbol: "PSTB",
};

const poolDraft: BoostDraft = {
  kind: "megapot_pool",
  budgetLabel: "18.00",
  activity: "either",
  tokenSymbol: "USDC",
};

const hash = "0x7f1daf00c9eea967d423bd6ac58f00905904757323da48387fe831cd914ac96c";

const meta = {
  title: "Flows/Rewards/Create a bounty",
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Ported from the legacy BoostCampaignSheet: bottom sheet on mobile, centred above md, with the "
          + "same compose shape — \"People earn by\" as a radio card group, a $-prefixed total budget with "
          + "one-tap presets, and the payment caption.\n\n"
          + "A song has one offer and bounties are legs on it, so this is never repeated per activity. Only "
          + "a Megapot pool can narrow the activity; a token bonus is always Either because its activity "
          + "column must be NULL. Activity policies are fixed and frozen "
          + "into the leg at creation. Megapot also has an additional sponsor score floor; this presentation does not yet expose it.\n\n"
          + "The review step shows the paying wallet, network and fee because the embedded wallet signs "
          + "without its own confirmation dialog. These are presentation fixtures with no-op callbacks, not a connected funding journey. The Functional boost story exercises the controller.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

function sheet(state: BoostState, extra: Partial<BoostSongSheetProps> = {}) {
  return () => (
    <BoostSongSheet
      onActivityChange={noop}
      onKindChange={noop}
      onBack={noop}
      onBudgetChange={noop}
      onConfirm={noop}
      onOpenChange={noop}
      onReconcile={noop}
      onRestart={noop}
      onReview={noop}
      onRewardChange={noop}
      open
      state={state}
      {...extra}
    />
  );
}

export const ComposeTokenBonus: Story = {
  render: sheet({ step: "compose", draft: bonusDraft, presets }),
  parameters: {
    docs: {
      description: {
        story:
          "A token bonus pays each qualifier the same amount. Its activity cannot be narrowed, so \"People "
          + "earn by\" is stated rather than asked.",
      },
    },
  },
};

export const ComposeMegapot: Story = {
  render: sheet({ step: "compose", draft: poolDraft, presets }),
  parameters: {
    docs: {
      description: {
        story: "A Megapot pool splits rather than paying per person, and its activity is choosable.",
      },
    },
  },
};

export const ComposeWithProblem: Story = {
  render: sheet({
    step: "compose",
    draft: { ...bonusDraft, budgetLabel: "0" },
    presets,
    problem: "Enter more than zero.",
  }),
};

export const Review: Story = {
  render: sheet({
    step: "quote",
    quote: {
      kind: "asset_bonus",
      activity: "either",
      rewardLabel: "1.00 PSTB each, up to 10",
      budgetLabel: "$10.00",
      senderLabel: "0x91016d…5c1a",
      networkLabel: "Base Sepolia",
      feeLabel: "$0.01",
    },
  }),
  parameters: {
    docs: {
      description: {
        story:
          "The wallet signs headlessly, so the paying address, network and fee appear here or nowhere.",
      },
    },
  },
};

export const Confirming: Story = {
  render: sheet({ step: "confirming" }),
  parameters: {
    docs: {
      description: {
        story: "No retry: the receipt written before broadcast is what prevents a second transfer.",
      },
    },
  },
};

export const AwaitingFinality: Story = {
  render: sheet({ step: "awaiting_finality", transactionHash: hash }),
};

export const Active: Story = {
  render: sheet({
    step: "active",
    live: {
      kind: "asset_bonus",
      activity: "either",
      rewardLabel: "1.00 PSTB each",
      remainingLabel: "7 of 10 left",
    },
  }),
};

export const FailedWrongChain: Story = {
  render: sheet({ step: "failed", failure: "wrong_chain", transactionHash: null }),
  parameters: {
    docs: {
      description: { story: "Proven before anything was sent, so a fresh attempt is safe." },
    },
  },
};

export const FailedInsufficientTokens: Story = {
  render: sheet({ step: "failed", failure: "insufficient_token_balance", transactionHash: null }),
};

export const FailedProviderRejected: Story = {
  render: sheet({ step: "failed", failure: "provider_rejected", transactionHash: null }),
  parameters: {
    docs: {
      description: {
        story:
          "The rejection arrived after the send was requested, so nothing is provable and no retry is "
          + "offered. This is the case that would otherwise double-spend.",
      },
    },
  },
};

export const FailedTransactionMismatch: Story = {
  render: sheet({ step: "failed", failure: "transaction_mismatch", transactionHash: hash }),
};

export const FailedTermsChanged: Story = {
  render: sheet({ step: "failed", failure: "terms_changed", transactionHash: hash }),
};

export const FailedRecoveryUnavailable: Story = {
  render: sheet({ step: "failed", failure: "recovery_unavailable", transactionHash: hash }),
};

export const FailedRecoveryCorrupt: Story = {
  render: sheet({ step: "failed", failure: "recovery_corrupt", transactionHash: null }),
};
