import { getRequestEvent, HydrationScript, type JSX } from "@solidjs/web";

export default function Document(props: { children: JSX.Element; clientEntry?: string }) {
  const event = getRequestEvent();
  const nonce = event?.locals?.cspNonce;
  const clientNonce = typeof document === "undefined"
    ? nonce
    : document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce ?? undefined;
  const clientEntry = props.clientEntry ?? (typeof document === "undefined"
    ? undefined
    : [...document.scripts].find(script => script.dataset.solidEntry)?.src);
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <HydrationScript nonce={clientNonce} />
        {clientEntry ? <script type="module" async nonce={clientNonce} data-solid-entry src={clientEntry} /> : null}
      </head>
      <body><div id="app-root">{props.children}</div></body>
    </html>
  );
}
