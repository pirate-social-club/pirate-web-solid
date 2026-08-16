import { hydrate } from "@solidjs/web";
import { sharedConfig } from "solid-js";
import App from "./App";

const root = document.getElementById("app-root")!;
// The SSR compiler wraps Document's props.children in ssrScope(), adding one
// server scope level that the client tree rooted at <App /> does not have.
// @solidjs/web@2.0.0-rc.0 declares owner but does not consume that option.
hydrate(() => <App />, root, { renderId: "2" });
sharedConfig.onHydrationEnd?.(() => {
  root.dataset.hydrated = "true";
});
