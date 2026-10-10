export const TELEGRAM_PROBE_PATH = "/internal/telegram-login-probe";
export const TELEGRAM_PROBE_CALLBACK_PATH = `${TELEGRAM_PROBE_PATH}/callback`;
export const TELEGRAM_PROBE_ORIGIN = "https://web-next-staging.pirate.sc";
export const TELEGRAM_PROBE_APP_ID = "cmsw5pis300b80cladbxx7bsr";
export const TELEGRAM_PROBE_EXPIRES_AT = Date.parse("2026-10-17T00:00:00Z");

export function isTelegramProbePage(pathname: string): boolean {
  return pathname === TELEGRAM_PROBE_PATH || pathname === TELEGRAM_PROBE_CALLBACK_PATH;
}

export function telegramProbeEnabled(origin: string, canonicalOrigin: string | undefined, now = Date.now()): boolean {
  return origin === TELEGRAM_PROBE_ORIGIN && canonicalOrigin === TELEGRAM_PROBE_ORIGIN &&
    Number.isFinite(now) && now < TELEGRAM_PROBE_EXPIRES_AT;
}
