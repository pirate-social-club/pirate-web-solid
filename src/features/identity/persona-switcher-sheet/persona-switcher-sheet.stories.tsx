import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { Button } from "../../../design-system";
import { PersonaSwitcherSheet, type PersonaSwitcherSheetProps } from "./persona-switcher-sheet.tsx";
import { switcherPersonas } from "./persona-switcher-fixtures.ts";

function PickerStory(props: Partial<PersonaSwitcherSheetProps>) {
  const [open, setOpen] = createSignal(true);
  const [selected, setSelected] = createSignal(switcherPersonas[0]!.personaId);
  return <><Button onClick={() => setOpen(true)}>Switch profile</Button><PersonaSwitcherSheet
    open={open()} onOpenChange={setOpen} personas={switcherPersonas} selectedPersonaId={selected()}
    onSelect={id => { setSelected(id); setOpen(false); }} {...props}
  /></>;
}
const meta = { title: "Parts/Identity/PersonaSwitcher", parameters: { layout: "centered", a11y: { test: "error" } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const DesktopDialog: Story = { render: () => <PickerStory forceMobile={false} /> };
export const MobileSheet: Story = { globals: { viewport: { value: "mobile1", isRotated: false } }, render: () => <PickerStory forceMobile /> };
export const Loading: Story = { render: () => <PickerStory personas={[]} loading /> };
export const Unavailable: Story = { render: () => <PickerStory personas={[]} unavailable onRetry={() => {}} /> };
export const Empty: Story = { render: () => <PickerStory personas={[]} /> };
export const SinglePersona: Story = { render: () => <PickerStory personas={switcherPersonas.slice(0, 1)} /> };
export const SelectPersona: Story = {
  render: () => <PickerStory />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("radio", { name: /Night Shift/ }));
    await expect(page.queryByRole("dialog")).not.toBeInTheDocument();
  },
};
