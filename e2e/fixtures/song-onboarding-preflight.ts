export default function preflight(): void {
  if (process.env.E2E_ALLOW_MUTATION !== "1") {
    throw new Error("Song onboarding creates one community and one song; E2E_ALLOW_MUTATION=1 is required.");
  }
  const email = process.env.E2E_PRIVY_EMAIL?.trim() || process.env.MODERATION_E2E_OWNER_EMAIL?.trim();
  const otp = process.env.E2E_PRIVY_OTP?.trim() || process.env.MODERATION_E2E_OWNER_OTP?.trim();
  if (!email || !otp || !/^\d{6}$/u.test(otp)) throw new Error("An authorized Privy test email and fixed OTP must be injected by the secret runner.");
  const target = new URL(process.env.E2E_BASE_URL?.trim() || "https://web-next-staging.pirate.sc");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname);
  const staging = target.origin === "https://web-next-staging.pirate.sc";
  if ((!local && !staging) || !["http:", "https:"].includes(target.protocol)
    || target.username || target.password || target.pathname !== "/" || target.search || target.hash) {
    throw new Error("Song onboarding requires the known staging origin or a prepared localhost origin; production is refused.");
  }
}
