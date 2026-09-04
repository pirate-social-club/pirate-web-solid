import { getRequestEvent, HydrationScript, type JSX } from "@solidjs/web";
import {
  resolveLocaleDirection,
  resolveLocaleLanguageTag,
  resolveRequestUiLocale,
} from "./lib/ui-locale-core.ts";
import { documentClientEntry } from "./asset-target.ts";

export default function Document(props: {
  children: JSX.Element;
  clientEntry?: string;
  canonicalAssetOrigin?: string;
  publicAppCanonicalOrigin?: string;
  hydrate?: boolean;
}) {
  const event = getRequestEvent();
  const nonce = event?.locals?.cspNonce;
  const clientNonce = typeof document === "undefined"
    ? nonce
    : document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce ?? undefined;
  const hydrate = () => props.hydrate !== false;
  const rawClientEntry = () => hydrate()
    ? props.clientEntry ?? (typeof document === "undefined"
        ? undefined
        : [...document.scripts].find(script => script.dataset.solidEntry)?.src)
    : undefined;
  const clientEntry = () => documentClientEntry(rawClientEntry(), props.canonicalAssetOrigin, hydrate());
  const locale = event === undefined
    ? resolveRequestUiLocale(
      new URL(typeof location === "undefined" ? "https://pirate.invalid/" : location.href),
      typeof navigator === "undefined" ? undefined : navigator.language,
    )
    : resolveRequestUiLocale(
      new URL(event.request.url),
      event.request.headers.get("accept-language"),
    );
  return (
    <html
      lang={resolveLocaleLanguageTag(locale)}
      dir={resolveLocaleDirection(locale)}
      data-public-app-canonical-origin={props.publicAppCanonicalOrigin}
    >
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {hydrate() ? <HydrationScript nonce={clientNonce} /> : null}
        {hydrate() && clientEntry()
          ? <script type="module" async nonce={clientNonce} data-solid-entry src={clientEntry()} />
          : null}
      </head>
      <body><div id="app-root">{props.children}</div></body>
    </html>
  );
}
