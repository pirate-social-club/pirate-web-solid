import { Button, Type } from "@pirate/web-solid-ui";
import { Show, createSignal } from "solid-js";
import { CommunityNamespaceSettingsController } from "./community-namespace-settings-controller";
import type { CommunityNamespaceSettingsPort } from "./owner-settings-model";
import { SpacesOwnerProofPanel } from "./spaces-owner-proof-panel";
import type { SpacesOwnerProofApi } from "./spaces-owner-proof-api";
import { createSpacesRouteAttachmentApi, type SpacesRouteAttachmentApi } from "./spaces-route-attachment-api";
import { SpacesRouteAttachmentPanel } from "./spaces-route-attachment-panel";
import { repairOwnerSession } from "./spaces-route-session-repair";

export function CommunityAddressSettings(props: {
  communityId: string;
  communityPath: string;
  namespaceApi?: CommunityNamespaceSettingsPort;
  spacesApi?: SpacesOwnerProofApi;
  /** Connecting a Spaces name as the community address. Tests supply a fake; production uses the session API. */
  spacesRouteApi?: SpacesRouteAttachmentApi;
}) {
  // A supplied API is a fixture with no session to repair, as in the other ceremonies.
  const routeApi = props.spacesRouteApi ?? createSpacesRouteAttachmentApi();
  const routeSessionRepair = props.spacesRouteApi === undefined ? repairOwnerSession : undefined;
  const [provider, setProvider] = createSignal<"hns" | "spaces">("hns");
  // Each ceremony reports its own work; the choice stays locked while either is busy.
  const [ceremonyBusy, setBusy] = createSignal(false);
  const [routeBusy, setRouteBusy] = createSignal(false);
  const busy = () => ceremonyBusy() || (provider() === "spaces" && routeBusy());
  return <section class="space-y-6">
    <div class="space-y-3">
      <Type as="p" variant="body">Choose the network that owns your community name.</Type>
      <div aria-label="Name network" class="flex gap-3" role="group">
        <Button disabled={busy()} aria-pressed={provider() === "hns" ? "true" : "false"} onClick={() => setProvider("hns")} variant={provider() === "hns" ? "default" : "secondary"}>Handshake</Button>
        <Button disabled={busy()} aria-pressed={provider() === "spaces" ? "true" : "false"} onClick={() => setProvider("spaces")} variant={provider() === "spaces" ? "default" : "secondary"}>Spaces</Button>
      </div>
    </div>
    <Show when={provider() === "hns"} fallback={<>
      <SpacesRouteAttachmentPanel onBusyChange={setRouteBusy} api={routeApi} communityId={props.communityId}
        sessionRepair={routeSessionRepair} />
      <SpacesOwnerProofPanel onBusyChange={setBusy} api={props.spacesApi} communityId={props.communityId} />
    </>}>
      <CommunityNamespaceSettingsController onBusyChange={setBusy} api={props.namespaceApi} communityId={props.communityId} communityPath={props.communityPath} />
    </Show>
  </section>;
}
