import { hydrate } from "@solidjs/web";
import { sharedConfig } from "solid-js";
import App from "./App";

const root = document.getElementById("app-root")!;
// Document owns the outer SSR scopes; hydration starts at the serialized App
// scope so lazy route asset ids match between the server and client trees.
hydrate(() => <App />, root, { renderId: "5" });
sharedConfig.onHydrationEnd?.(() => {
  root.dataset.hydrated = "true";
});
