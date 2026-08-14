import { getRequestEvent } from "@solidjs/web";

export default function BindingSeamRoute() {
  const result = getRequestEvent()?.locals?.bindingResult;
  return (
    <main data-route-path="/seam/binding">
      <h1>Binding seam</h1>
      <pre id="binding-result">{result ?? "binding result unavailable"}</pre>
    </main>
  );
}
