/** @jsxImportSource @solidjs/web */
import "../../../src/index.css";
import { render } from "@solidjs/web";
import { UiLocaleProvider } from "../../../src/lib/ui-locale.tsx";
import { StudyV2RouteView } from "../../../src/features/studying/study-v2-route-view.tsx";

// Real product route, generated clients, native default authority/journal/locks.
// The fixture supplies only its already-authoritative public post coordinates.
const app = document.getElementById("app");
if (app === null) throw new Error("Owned browser fixture root missing");
render(() => <UiLocaleProvider locale="en">
  <StudyV2RouteView postId="post-1" communityId="community-1" />
</UiLocaleProvider>, app);
