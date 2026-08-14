import { getRequestEvent, renderToStream } from "@solidjs/web";
import manifest from "virtual:solid-manifest";
import App from "./App";
import Document from "./Document";

export function render(_request?: Request, context?: { clientEntry?: string }) {
  const nonce = getRequestEvent()?.locals?.cspNonce;
  return renderToStream(
    () => <Document clientEntry={context?.clientEntry}><App /></Document>,
    { nonce, manifest },
  );
}
