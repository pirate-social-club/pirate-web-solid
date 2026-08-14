import { Meta, Link, Title } from "@solidjs/meta";
import { useQuery } from "@tanstack/solid-query";
import { createSignal, Loading } from "solid-js";
import { pageRoutes } from "virtual:file-routes";
import PublicVideoFeed from "../../components/public-video-feed";
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
} from "../../design-system";
import { createApiVersionQuery } from "../../lib/api/home-query";
import { useHostContext } from "../../lib/host-context";

export default function HomeRoute() {
  const [count, setCount] = createSignal(0);
  const [streamed] = createSignal(
    () => new Promise<string>(resolve => setTimeout(() => resolve("stream-complete"), 80)),
    { ssrSource: "server" },
  );
  const [dialogOpen, setDialogOpen] = createSignal(false);
  const [displayName, setDisplayName] = createSignal("");
  const apiVersion = useQuery(() => createApiVersionQuery());
  const host = useHostContext();

  return (
    <main data-route-path="/">
      <Title>Home · Pirate Web</Title>
      <Meta name="description" content="Pirate Web video feed" />
      <Meta property="og:title" content="Pirate Web" />
      <Meta property="og:type" content="website" />
      <Link rel="canonical" href="/" />
      <h1>Pirate Web Solid shell</h1>
      <p id="seam-host">host-surface: {host.surface}</p>
      <p id="host-community-slug">host-community-slug: {host.communitySlug ?? "none"}</p>
      <p id="route-manifest">filesystem-routing routes: {pageRoutes.length}</p>
      <Button id="hydration-button" type="button" onClick={() => setCount(value => value + 1)}>
        hydration-count: {count()}
      </Button>
      <Loading fallback={<p id="api-version-fallback">loading api status</p>}>
        <p id="api-version" data-api-status={apiVersion.isSuccess ? "success" : "error"}>
          API status: {apiVersion.data?.service ?? "unavailable"}
        </p>
      </Loading>
      <section id="hydration-dialog-fixture" aria-label="Overlay hydration fixture">
        <Dialog open={dialogOpen()} onOpenChange={setDialogOpen}>
          <DialogTrigger id="hydration-dialog-open" as={Button} type="button">
            Open hydration dialog
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Hydration dialog</DialogTitle>
              <DialogDescription>
                This portalled design-system overlay is part of the app gate.
              </DialogDescription>
            </DialogHeader>
            <p id="hydration-dialog-marker">portal-ready</p>
          </DialogContent>
        </Dialog>
      </section>
      <section id="hydration-form-fixture" aria-label="Form hydration fixture">
        <TextField name="display-name" value={displayName()} onChange={setDisplayName}>
          <TextFieldLabel for="hydration-display-name">Display name</TextFieldLabel>
          <TextFieldInput id="hydration-display-name" />
          <TextFieldDescription id="hydration-display-name-description">
            Controlled form values stay connected after hydration.
          </TextFieldDescription>
        </TextField>
      </section>
      <Loading fallback={<p id="stream-fallback">streaming-shell</p>}>
        <p id="stream-result">{streamed()}</p>
      </Loading>
      <PublicVideoFeed />
      <nav aria-label="Seam probes">
        <a href="/seam/host">host seam</a>
        <a href="/seam/binding">binding seam</a>
        <a href="/p/demo-post">post route</a>
        <a href="/u/demo-user">profile route</a>
      </nav>
    </main>
  );
}
