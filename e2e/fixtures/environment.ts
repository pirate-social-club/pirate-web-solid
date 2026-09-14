type Environment = Readonly<Record<string, string | undefined>>;

export function e2eBaseURL(env: Environment = process.env): string {
  return env.E2E_BASE_URL?.trim() || "https://web-next-staging.pirate.sc";
}

function credentials(env: Environment) {
  return {
    email: env.E2E_PRIVY_EMAIL?.trim() || env.MODERATION_E2E_OWNER_EMAIL?.trim(),
    otp: env.E2E_PRIVY_OTP?.trim() || env.MODERATION_E2E_OWNER_OTP?.trim(),
  };
}

export function hasE2eAuthCredentials(env: Environment = process.env): boolean {
  const { email, otp } = credentials(env);
  return Boolean(email && otp && /^\d{6}$/u.test(otp));
}

export function e2eAuthCredentials(env: Environment = process.env): Readonly<{ email: string; otp: string }> {
  const { email, otp } = credentials(env);
  if (!email || !otp || !/^\d{6}$/u.test(otp)) {
    throw new Error("An authorized Privy test email and six-digit fixed OTP must be injected by the secret runner.");
  }
  return { email, otp };
}

/** Validate before starting a browser or sending credentials to any origin. */
export function requireMutationEnvironment(env: Environment = process.env): void {
  if (env.E2E_ALLOW_MUTATION !== "1") {
    throw new Error("This acceptance run creates persistent content; E2E_ALLOW_MUTATION=1 is required.");
  }
  let target: URL;
  try {
    target = new URL(e2eBaseURL(env));
  } catch {
    throw new Error("Acceptance requires the known staging origin or a prepared localhost origin; invalid target refused.");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname);
  const staging = target.origin === "https://web-next-staging.pirate.sc";
  if ((!local && !staging) || !["http:", "https:"].includes(target.protocol)
    || target.username || target.password || target.pathname !== "/" || target.search || target.hash) {
    throw new Error("Acceptance requires the known staging origin or a prepared localhost origin; production is refused.");
  }
  e2eAuthCredentials(env);
}
