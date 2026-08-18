import { createSignal, untrack } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { Type } from "@pirate/web-solid-ui";
import { CommunityRulesEditorPage, type RuleDraft } from "./community-rules-editor-page";

const DEFAULT_RULES: RuleDraft[] = [
  { id: "rule-1", existingRuleId: "rule-1", title: "Respect others and be civil", body: "No harassment, hate speech, or toxic behavior. Treat all contributors and members with kindness.", reportReason: "Respect others and be civil" },
  { id: "rule-2", existingRuleId: "rule-2", title: "No spam", body: "Excessive promotion, spam, or advertising of any kind is not allowed.", reportReason: "No spam" },
];

function RulesEditorStory(props: { initialRules: RuleDraft[] }) {
  const [rules, setRules] = createSignal(untrack(() => props.initialRules));
  const [saved, setSaved] = createSignal(0);
  return <main class="mx-auto w-full max-w-5xl p-4 md:p-8" dir="rtl"><CommunityRulesEditorPage onRulesChange={setRules} onSave={() => setSaved((current) => current + 1)} rules={rules()} /><Type aria-live="polite" class="sr-only" variant="caption">Saved {saved()} times</Type></main>;
}

const meta = { title: "Compositions/Community/Moderation/Rules", component: CommunityRulesEditorPage, parameters: { layout: "fullscreen", a11y: { test: "error" } } } satisfies Meta<typeof CommunityRulesEditorPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { rules: DEFAULT_RULES },
  globals: { direction: "rtl", viewport: { value: "mobile1", isRotated: false } },
  render: (args) => <RulesEditorStory initialRules={args.rules} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Add rule" }));
    const title = canvas.getByPlaceholderText("Rule name");
    await expect(title).toHaveFocus();
    await expect(canvas.getByRole("button", { name: "Save rule" })).toBeDisabled();
    await userEvent.type(title, "Be constructive");
    await userEvent.type(canvas.getByPlaceholderText("Description"), "Keep feedback useful.");
    await userEvent.type(canvas.getByPlaceholderText("Report reason"), "Constructive feedback");
    await userEvent.click(canvas.getByRole("button", { name: "Save rule" }));
    await expect(canvas.getByText("Be constructive")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(canvas.getByText("Saved 1 times")).toBeInTheDocument();
  },
};

export const Blank: Story = {
  args: { rules: [] },
  render: (args) => <RulesEditorStory initialRules={args.rules} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const save = canvas.getByRole("button", { name: "Save" });
    await expect(save).not.toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Add rule" }));
    await expect(canvas.getByPlaceholderText("Rule name")).toHaveFocus();
    await userEvent.click(canvas.getByRole("button", { name: "Cancel" }));
    await expect(canvas.getByText("No rules yet.")).toBeInTheDocument();
  },
};
