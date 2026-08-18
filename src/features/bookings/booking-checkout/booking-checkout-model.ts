export type BookingCheckoutPhase = "holding" | "pending" | "conflict";

export function secondsUntilHoldExpires(holdExpiresAtUtc: string, nowUtc: string): number {
  const expires = Date.parse(holdExpiresAtUtc);
  const now = Date.parse(nowUtc);
  if (!Number.isFinite(expires) || !Number.isFinite(now)) return 0;
  return Math.max(0, Math.floor((expires - now) / 1000));
}

export function formatHoldCountdown(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

export function checkoutHeading(phase: BookingCheckoutPhase): string {
  switch (phase) {
    case "pending":
      return "Payment verifying";
    case "conflict":
      return "That slot was released";
    case "holding":
      return "Complete your payment";
  }
}
