import { useHostContext } from "../../lib/host-context";

export default function HostSeamRoute() {
  const host = useHostContext();
  return (
    <main data-route-path="/seam/host">
      <h1>Host seam</h1>
      <p id="seam-host">host-surface: {host.surface}</p>
      <p id="host-community-slug">host-community-slug: {host.communitySlug ?? "none"}</p>
      <p id="host-imported-root">imported-root: {host.importedRoot ? "yes" : "no"}</p>
      <p id="host-forwarding-metadata">forwarding-metadata: {host.forwardingMetadataPresent ? "present" : "missing"}</p>
    </main>
  );
}
