import type { Meta, StoryObj } from "storybook-solidjs-vite";

import {
  buttonVariants,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from "./design-system";

// Pipeline canary for the standalone app catalog: proves the Solid transform,
// Tailwind tokens, design-system facade, and locale/theme decorators work
// without reaching into the historical React application.
const meta = {
  title: "App/Foundations/Storybook Smoke",
  parameters: {
    layout: "centered",
  },
  render: () => (
    <div class="flex flex-col items-start gap-4">
      <TextField>
        <TextFieldLabel>Handle</TextFieldLabel>
        <TextFieldInput />
      </TextField>
      <Dialog>
        <DialogTrigger class={buttonVariants({ variant: "default" })}>
          Open dialog
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Standalone catalog online</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  ),
} satisfies Meta;

export default meta;

export const Default: StoryObj = {};
