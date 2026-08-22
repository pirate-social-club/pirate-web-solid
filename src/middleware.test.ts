import { describe, expect, test } from "vitest";

import { securityPolicy } from "./middleware";

describe("security policy", () => {
  test("allows Privy sign-in on ordinary application routes", () => {
    const policy = securityPolicy("/auth/sign-in", "nonce-value");
    expect(policy).toContain("frame-src https://auth.privy.io");
    expect(policy).toContain("connect-src 'self' https://auth.privy.io");
    expect(policy).toContain("script-src 'nonce-nonce-value' 'strict-dynamic'");
  });

  test("allows Privy sign-in and data QR images on the Very route", () => {
    const policy = securityPolicy("/verify/very", "nonce-value");
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
    expect(policy).toContain("img-src 'self' data: https://assets.very.org");
    expect(policy).toContain("frame-src https://auth.privy.io");
    expect(policy).toContain("connect-src 'self' https://auth.privy.io https://bridge.very.org https://verify.very.org");
    expect(policy).not.toContain("wss://bridge.very.org");
  });

  test("allows Privy on ordinary routes without widening other origins", () => {
    const policy = securityPolicy("/communities", "nonce-value");
    expect(policy).toContain("frame-src https://auth.privy.io");
    expect(policy).toContain("connect-src 'self' https://auth.privy.io");
    expect(policy).not.toContain("https://challenges.cloudflare.com");
  });

  test("keeps the expanded ZKPassport allowlist on its dedicated route", () => {
    const policy = securityPolicy("/verify/zkpassport", "nonce-value");
    expect(policy).toContain("https://challenges.cloudflare.com");
    expect(policy).toContain("wss://bridge.zkpassport.id");
    expect(policy).toContain("https://auth.privy.io");
  });
});
