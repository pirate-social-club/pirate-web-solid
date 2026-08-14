import { getRequestEvent, HydrationScript } from "@solidjs/web";

export default function Document(props: { children: unknown; clientEntry?: string }) {
  const event = getRequestEvent();
  const nonce = event?.locals?.cspNonce;
  const hostContext = event?.locals?.hostContext;
  const clientNonce = typeof document === "undefined"
    ? nonce
    : document.querySelector("script[nonce]")?.nonce ?? undefined;
  const clientEntry = props.clientEntry ?? (typeof document === "undefined"
    ? undefined
    : [...document.scripts].find(script => script.dataset.solidEntry)?.src);
  return (
    <html
      lang="en"
      data-host-surface={hostContext?.surface}
      data-community-slug={hostContext?.communitySlug ?? undefined}
      data-imported-root={hostContext?.importedRoot ? "1" : undefined}
      data-forwarding-metadata={hostContext?.forwardingMetadataPresent ? "1" : undefined}
    >
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
