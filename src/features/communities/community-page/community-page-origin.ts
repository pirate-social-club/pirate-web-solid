import { getRequestEvent } from "@solidjs/web";

function browserCanonicalOrigin(): string | undefined {
  if (typeof document === "undefined" || typeof location === "undefined") return undefined;
  const href = document.querySelector("link[rel='canonical']")?.getAttribute("href");
  if (href !== null && href !== undefined && href !== "") {
    try {
      return new URL(href, location.href).origin;
    } catch {
      return undefined;
    }
  }
  const labels = location.hostname.split(".");
  return labels.length === 2 && labels[0] === "app" ? undefined : location.origin;
}

/** The request origin may be an HNS ingress and is safe only for public, credential-free reads. */
export function communityRequestOrigin(): string | undefined {
  const event = getRequestEvent();
  if (event !== undefined) return new URL(event.request.url).origin;
  return typeof location === "undefined" ? undefined : location.origin;
}

/** Canonical writes and metadata use the rewritten SSR origin or the document's frozen canonical link. */
export function communityCanonicalOrigin(): string | undefined {
  const event = getRequestEvent();
  if (event !== undefined) return new URL(event.request.url).origin;
  return browserCanonicalOrigin();
}
