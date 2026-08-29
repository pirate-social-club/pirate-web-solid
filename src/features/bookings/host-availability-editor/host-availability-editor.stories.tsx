import type { JSX } from "@solidjs/web";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { HostAvailabilityEditor, type AvailabilityExceptionDraft, type AvailabilityRuleDraft, type PriceRuleDraft } from "./host-availability-editor";

const rules: AvailabilityRuleDraft[] = [{ id: "rule-1", byWeekday: [1, 2, 3, 4, 5], startLocal: "09:00", endLocal: "17:00", slotDurationMinutes: 30 }, { id: "rule-2", byWeekday: [0, 6], startLocal: "10:00", endLocal: "14:00", slotDurationMinutes: 30 }];
const priceRules: PriceRuleDraft[] = [{ id: "price-1", matchWeekday: [1, 2, 3, 4, 5], startLocal: "09:00", endLocal: "12:00", priceCents: 6000 }];
const exceptions: AvailabilityExceptionDraft[] = [{ id: "exc-1", kind: "block", startUtc: "2026-07-04T00:00:00Z", endUtc: "2026-07-04T23:59:59Z" }];
const meta = { title: "Screens/Bookings/HostAvailabilityEditor", component: HostAvailabilityEditor, args: { rules: [], priceRules: [], exceptions: [] }, parameters: { layout: "fullscreen", a11y: { test: "error" } } } satisfies Meta<typeof HostAvailabilityEditor>;
export default meta;
type Story = StoryObj<typeof meta>;
const frame = (children: JSX.Element): JSX.Element => <div class="mx-auto w-full max-w-2xl p-4">{children}</div>;
function InteractiveEditor() {
  const [currentRules, setRules] = createSignal(rules);
  const [currentPriceRules, setPriceRules] = createSignal(priceRules);
  const [currentExceptions, setExceptions] = createSignal(exceptions);
  return <HostAvailabilityEditor exceptions={currentExceptions()} onExceptionsChange={setExceptions} onPriceRulesChange={setPriceRules} onRulesChange={setRules} priceRules={currentPriceRules()} rules={currentRules()} />;
}
export const Default: Story = { render: () => frame(<InteractiveEditor />), play: async ({ canvasElement }) => { const canvas = within(canvasElement); const add = canvas.getByRole("button", { name: "Add recurring rule" }); await userEvent.click(add); await expect(canvas.getByRole("button", { name: "Remove rule rule-3" })).toBeVisible(); const input = canvas.getByRole("spinbutton", { name: "Slot length for rule-1" }); await userEvent.clear(input); await waitFor(() => expect(canvas.getByRole("spinbutton", { name: "Slot length for rule-1" })).toHaveValue(5)); await userEvent.click(canvas.getByRole("button", { name: "Remove rule rule-3" })); await expect(canvas.queryByRole("button", { name: "Remove rule rule-3" })).not.toBeInTheDocument(); } };
export const Empty: Story = { render: () => frame(<HostAvailabilityEditor rules={[]} priceRules={[]} exceptions={[]} />) };
export const Mobile: Story = { render: () => <div class="mx-auto w-full max-w-sm p-4"><InteractiveEditor /></div>, globals: { direction: "rtl" } };
