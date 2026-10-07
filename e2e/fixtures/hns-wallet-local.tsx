/** @jsxImportSource @solidjs/web */
import "../../src/index.css";
import { render } from "@solidjs/web";
import { createRoot } from "solid-js";
import { createCommunityNamespaceSettingsApi } from "../../src/features/community/owner-settings/community-namespace-settings-api";
import { CommunityNamespaceSettingsController } from "../../src/features/community/owner-settings/community-namespace-settings-controller";

// The suite intercepts this generated client's local HTTP requests. No owner
// session or live service is involved; production state management is intact.
createRoot(() => {
  const api = createCommunityNamespaceSettingsApi({
    communityId: "community-fixture", communityPath: "/c/community-fixture",
    readCsrfToken: () => "fixture-csrf",
  });
  render(() => <main class="mx-auto max-w-3xl p-8">
    <CommunityNamespaceSettingsController api={api} communityId="community-fixture" communityPath="/c/community-fixture" />
  </main>, document.getElementById("app")!);
});
