import { createSignal, Loading } from "solid-js";
import { getRequestEvent } from "@solidjs/web";
import { pageRoutes } from "virtual:file-routes";
import "./index.css";

export default function App() {
  const [count, setCount] = createSignal(0);
  const [streamed] = createSignal(
    () => new Promise<string>(resolve => setTimeout(() => resolve("stream-complete"), 80)),
    { ssrSource: "server" },
  );
  const requestEvent = getRequestEvent();
  const seamHost = requestEvent?.locals?.seamHost
    ?? (typeof document === "undefined"
      ? "unknown"
      : document.querySelector("#seam-host")?.textContent?.replace("host-surface: ", "") ?? "unknown");
  const bindingResult = requestEvent?.locals?.bindingResult
    ?? (typeof document === "undefined" ? undefined : document.querySelector("#binding-result")?.textContent);

  return (
    <main>
      <h1>Pirate Web Solid shell</h1>
      <p id="seam-host">host-surface: {seamHost}</p>
      <p id="route-manifest">filesystem-routing routes: {Object.keys(pageRoutes).length}</p>
      <button id="hydration-button" type="button" onClick={() => setCount(value => value + 1)}>
        hydration-count: {count()}
      </button>
      <Loading fallback={<p id="stream-fallback">streaming-shell</p>}>
        <p id="stream-result">{streamed()}</p>
      </Loading>
      {bindingResult ? (
        <pre id="binding-result">{bindingResult}</pre>
      ) : null}
      <nav>
        <a href="/seam/host">host seam</a>
        <a href="/seam/binding">binding seam</a>
      </nav>
    </main>
  );
}
