import { hydrate } from "@solidjs/web";
import { sharedConfig } from "solid-js";
import App from "./App";

const root = document.getElementById("app-root")!;
hydrate(() => <App />, root);
sharedConfig.onHydrationEnd?.(() => {
  root.dataset.hydrated = "true";
});
