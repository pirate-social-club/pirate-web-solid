import { createSignal, untrack } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { Type } from "@pirate/web-solid-ui";

import { CommunityGateWizardPage } from "./community-gate-wizard-page";
import {
  createDefaultGateWizardDraft,
  replaceGateCheck,
  toggleGateCheck,
  type GateWizardDraft,
} from "./community-gate-wizard-model";

function GateWizardStory(props: {
  catalogMode?: "production" | "exploration";
  initialDraft?: GateWizardDraft;
  initialStep?: "checks" | "review";
}) {
  const [draft, setDraft] = createSignal(untrack(() => props.initialDraft ?? createDefaultGateWizardDraft()));
  const [finished, setFinished] = createSignal(0);
  return (
    <main class="mx-auto w-full max-w-3xl p-4 md:p-8">
      <CommunityGateWizardPage
        catalogMode={props.catalogMode}
        draft={draft()}
        initialStep={props.initialStep}
        onDraftChange={setDraft}
        onFinish={() => setFinished((current) => current + 1)}
      />
      <Type aria-live="polite" class="sr-only" variant="caption">
        Finished {finished()} times
      </Type>
    </main>
  );
}

const meta = {
  title: "Compositions/Community/Creation/GateWizard",
  component: CommunityGateWizardPage,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof CommunityGateWizardPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Exploration: Story = {
  args: { catalogMode: "exploration", draft: createDefaultGateWizardDraft() },
  render: (args) => <GateWizardStory catalogMode={args.catalogMode} initialDraft={args.draft} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Step 1: checks with implicit AND and a human-only baseline.
    await userEvent.click(canvas.getByRole("checkbox", { name: "Adults only (18+)" }));
    await userEvent.click(canvas.getByRole("checkbox", { name: "Nationality" }));
    await expect(canvas.getByRole("button", { name: "Continue" })).toBeDisabled();
    await userEvent.type(canvas.getByRole("textbox", { name: "Search countries" }), "Japan");
    await userEvent.click(canvas.getByRole("checkbox", { name: "Japan" }));
    await expect(canvas.getByRole("button", { name: "Continue" })).toBeEnabled();
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    // Step 2: review is a plain-language summary.
    await expect(canvas.getByText("Who can join")).toBeInTheDocument();
    await expect(canvas.getByText("Humans only")).toBeInTheDocument();
    await expect(canvas.getByText("Extra checks")).toBeInTheDocument();
    await expect(canvas.getByText("At least 18 years old")).toBeInTheDocument();
    await expect(canvas.getByText(/Japan/)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Create community" }));
    await expect(canvas.getByText("Finished 1 times")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Back" }));
    await expect(canvas.getByText("Which checks should members pass?")).toBeInTheDocument();
  },
};

export const ProductionCatalog: Story = {
  args: { catalogMode: "production", draft: createDefaultGateWizardDraft() },
  render: (args) => <GateWizardStory catalogMode={args.catalogMode} initialDraft={args.draft} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Which checks should members pass?")).toBeInTheDocument();
    await expect(canvas.getByRole("checkbox", { name: "Adults only (18+)" })).toBeEnabled();
    await expect(canvas.getByRole("checkbox", { name: "Nationality" })).toBeDisabled();
    await expect(canvas.queryByRole("checkbox", { name: "NFT" })).toBeNull();
    await expect(canvas.getByRole("button", { name: "Continue" })).toBeEnabled();
  },
};

function createProductionReviewDraft(): GateWizardDraft {
  return toggleGateCheck(createDefaultGateWizardDraft(), "age18", "production");
}

export const ProductionReview: Story = {
  args: {
    catalogMode: "production",
    draft: createProductionReviewDraft(),
    initialStep: "review",
  },
  render: (args) => (
    <GateWizardStory
      catalogMode={args.catalogMode}
      initialDraft={args.draft}
      initialStep={args.initialStep}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Ready to create your community?")).toBeInTheDocument();
    await expect(canvas.getByText("Who can join")).toBeInTheDocument();
    await expect(canvas.getByText("Humans only")).toBeInTheDocument();
    await expect(canvas.getByText("Extra checks")).toBeInTheDocument();
    await expect(canvas.getByText("At least 18 years old")).toBeInTheDocument();
  },
};

function createShowcaseDraft(): GateWizardDraft {
  let draft = createDefaultGateWizardDraft();
  draft = toggleGateCheck(draft, "age18", "exploration");
  draft = replaceGateCheck(draft, { kind: "nationality", allowedCountries: ["JP", "DE"] });
  draft = replaceGateCheck(draft, { kind: "gender", allowedMarkers: ["M", "F"] });
  draft = replaceGateCheck(draft, {
    kind: "nft",
    config: {
      mode: "collectible",
      category: "trading-card",
      subject: "Pirate rookie card",
      minQuantity: 2,
    },
  });
  draft = replaceGateCheck(draft, {
    kind: "token_balance",
    assetId: "eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    minAmount: "100",
  });
  draft = replaceGateCheck(draft, { kind: "passport_score", minimumScore: 20 });
  return draft;
}

export const ChecksShowcase: Story = {
  args: { catalogMode: "exploration", initialStep: "checks", draft: createShowcaseDraft() },
  render: (args) => (
    <GateWizardStory
      catalogMode={args.catalogMode}
      initialDraft={args.draft}
      initialStep={args.initialStep}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("checkbox", { name: "Adults only (18+)" })).toBeChecked();
    await expect(canvas.getByRole("checkbox", { name: "Japan" })).toBeChecked();
    await expect(canvas.getByRole("checkbox", { name: "M — male marker" })).toBeChecked();
    await expect(canvas.getByRole("radio", { name: "A specific collectible" })).toBeChecked();
    // Capability labels are always visible next to non-available checks.
    await expect(canvas.getAllByText("Policy model pending").length).toBeGreaterThan(0);
    await expect(canvas.getAllByText(/Exploration — not backed by api-next yet/).length).toBeGreaterThan(0);
    await expect(canvas.getByRole("button", { name: "Continue" })).toBeEnabled();
  },
};

export const ReviewShowcase: Story = {
  args: { catalogMode: "exploration", initialStep: "review", draft: createShowcaseDraft() },
  render: (args) => (
    <GateWizardStory
      catalogMode={args.catalogMode}
      initialDraft={args.draft}
      initialStep={args.initialStep}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Who can join")).toBeInTheDocument();
    await expect(canvas.getByText("Humans only")).toBeInTheDocument();
    await expect(canvas.getByText("Extra checks")).toBeInTheDocument();
    await expect(canvas.getByText("At least 18 years old")).toBeInTheDocument();
    await expect(canvas.getByText("Document from: Germany, Japan")).toBeInTheDocument();
    await expect(canvas.getByText("Gender marker: M, F")).toBeInTheDocument();
    await expect(
      canvas.getByText("Owns 2 or more Trading card: Pirate rookie card"),
    ).toBeInTheDocument();
    await expect(canvas.getByText(/Gitcoin Passport score of 20 or more/)).toBeInTheDocument();
  },
};
