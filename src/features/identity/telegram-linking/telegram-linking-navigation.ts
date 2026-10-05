const token = /^[A-Za-z0-9_-]{43}$/u;
export function linkReference(href: string): string | undefined {
  const params = new URL(href).searchParams;
  const value = params.get("navigation_reference");
  return params.getAll("navigation_reference").length === 1 && value !== null && token.test(value) ? value : undefined;
}

export type TelegramCallback = { code: string; state: string };
/** Capture only in the browser, then scrub the address before any asynchronous work. */
export function takeTelegramCallback(href: string, replace: (path: string) => void): TelegramCallback | undefined {
  const url = new URL(href);
  const params = url.searchParams;
  const code = params.get("code"), state = params.get("state");
  replace(url.pathname);
  if (params.has("error") || params.getAll("code").length !== 1 || params.getAll("state").length !== 1 ||
    code === null || code.length === 0 || code.length > 2048 || state === null || !token.test(state)) return undefined;
  return { code, state };
}

export function confirmedTransactionId(href: string): string | undefined {
  const params = new URL(href).searchParams;
  const value = params.get("transaction_id");
  return [...params.keys()].length === 1 && params.getAll("transaction_id").length === 1 && value !== null && token.test(value) ? value : undefined;
}

export function telegramAuthorizationUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.origin === "https://oauth.telegram.org" && !url.username && !url.password && !url.hash) return url.href;
  } catch { /* Invalid navigation is refused without logging the value. */ }
  return undefined;
}

export function communityBotUrl(username: string): string | undefined {
  return /^[A-Za-z0-9_]{5,32}$/u.test(username) ? `https://t.me/${username}` : undefined;
}
