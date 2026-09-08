import type { Meta, StoryObj } from "storybook-solidjs-vite";

import type { BoostDraft, BoostState } from "./boost-song-model";
import { BoostSongSheet, type BoostSongSheetProps } from "./boost-song-sheet";

const songTitle = "Salt & Static";
const noop = () => {};

const poolDraft: BoostDraft = {
  kind: "megapot_pool",
  budgetLabel: "18.00",
  activity: "either",
  tokenSymbol: "USDC",
};

const bonusDraft: BoostDraft = {
  kind: "asset_bonus",
  budgetLabel: "10.00",
  rewardPerClaimLabel: "1.00",
  activity: "either",
  tokenSymbol: "PSTB",
};

const hash = "0x7f1daf00c9eea967d423bd6ac58f00905904757323da48387fe831cd914ac96c";

const meta = {
  title: "Flows/Rewards/Boost a song",
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "The sponsor flow reached from a post's overflow menu, the way the legacy app opened Boost. It is "
          + "a modal with a three-step spine — compose, quote, approve — plus the live campaign and "
          + "failure states.\n\nA song has one offer and rewards are legs on it, so a sponsor never repeats "
          + "this per activity. \"Study or singing\" is the default and the only option for a token bonus, "
          + "whose activity column must be NULL; only a Megapot leg can narrow it. Megapot has an additional score floor above each activity policy.",
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
      onBack={noop}
      onBudgetChange={noop}
      onFund={noop}
      onOpenChange={noop}
      onReconcile={noop}
      onRestart={noop}
      onReview={noop}
      onRewardChange={noop}
      open
      songTitle={songTitle}
      state={state}
      {...extra}
    />
  );
}

export const ComposeTokenBonus: Story = {
  render: sheet({ step: "compose", draft: bonusDraft }),
  parameters: {
    docs: {
      description: {
        story:
          "A token bonus takes a total and a per-person amount. No activity picker: it always counts for "
          + "study or singing, stated as a line rather than asked as a question.",
      },
    },
  },
};

export const ComposeMegapot: Story = {
  render: sheet({ step: "compose", draft: poolDraft }),
  parameters: {
    docs: {
      description: {
        story:
          "A Megapot ticket splits rather than paying per person, so there is no per-person field. Here the "
          + "activity is choosable, defaulting to either.",
      },
    },
  },
};

export const ComposeWithProblem: Story = {
  render: sheet({ step: "compose", draft: { ...bonusDraft, budgetLabel: "0" }, problem: "Enter more than zero." }),
};

export const QuoteTokenBonus: Story = {
  render: sheet({
    step: "quote",
    quote: {
      kind: "asset_bonus",
      budgetLabel: "10.00",
      tokenSymbol: "PSTB",
      yieldLabel: "up to 10 accounts",
      activity: "either",
    },
  }),
};

export const QuoteMegapot: Story = {
  render: sheet({
    step: "quote",
    quote: {
      kind: "megapot_pool",
      budgetLabel: "18.00",
      tokenSymbol: "USDC",
      yieldLabel: "shared by everyone who qualifies today",
      activity: "either",
    },
  }),
};

export const Confirming: Story = {
  render: sheet({ step: "confirming" }),
  parameters: {
    docs: {
      description: {
        story: "Handed to the wallet. No retry is offered — the receipt written before broadcast is the guard.",
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
    live: { kind: "asset_bonus", rewardLabel: "1.00 PSTB each", remainingLabel: "7 of 10 left" },
  }),
};

export const FailedWrongChain: Story = {
  render: sheet({ step: "failed", failure: "wrong_chain", transactionHash: null }),
  parameters: {
    docs: {
      description: {
        story: "A locally proven pre-send failure, so a fresh attempt is safe and Try again is offered.",
      },
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
          "The rejection arrived after the send was requested, so nothing can be proven and no retry is "
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
  parameters: {
    docs: { description: { story: "The only offered action is handing over a hash, which authorizes nothing." } },
  },
};

export const FailedRecoveryCorrupt: Story = {
  render: sheet({ step: "failed", failure: "recovery_corrupt", transactionHash: null }),
};
