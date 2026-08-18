import { Title } from "@solidjs/meta";
import { createSignal } from "solid-js";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  TextField,
  TextFieldDescription,
  TextFieldInput,
  TextFieldLabel,
} from "../design-system";

export default function HomeRoute() {
  const [count, setCount] = createSignal(0);
  const [dialogOpen, setDialogOpen] = createSignal(false);
  const [displayName, setDisplayName] = createSignal("");

  return (
    <main data-route-path="/">
      <Title>Pirate Web</Title>
      <h1>Pirate Web Solid shell</h1>
      <p>A standalone Solid runtime is ready for future product lanes.</p>
      <Button id="hydration-button" type="button" onClick={() => setCount(value => value + 1)}>
        hydration-count: {count()}
      </Button>
      <section id="hydration-dialog-fixture" aria-label="Overlay hydration fixture">
        <Dialog open={dialogOpen()} onOpenChange={setDialogOpen}>
          <DialogTrigger id="hydration-dialog-open" type="button">
            Open hydration dialog
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Hydration dialog</DialogTitle>
              <DialogDescription>Internal solid-ui overlays hydrate in the direct Worker shell.</DialogDescription>
            </DialogHeader>
            <p id="hydration-dialog-marker">portal-ready</p>
          </DialogContent>
        </Dialog>
      </section>
      <section id="hydration-form-fixture" aria-label="Form hydration fixture">
        <TextField name="display-name" value={displayName()} onChange={setDisplayName}>
          <TextFieldLabel>Display name</TextFieldLabel>
          <TextFieldInput id="hydration-display-name" />
          <TextFieldDescription id="hydration-display-name-description">
            Controlled form values stay connected after hydration.
          </TextFieldDescription>
        </TextField>
      </section>
    </main>
  );
}
