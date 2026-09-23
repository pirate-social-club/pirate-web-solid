import { describe, expect, test } from "vitest";

import { oauthRedirectUrl, safeReturnPath, signInReturnPath } from "./sign-in-return.ts";

const ORIGIN = "https://pirate.test";

function redirectParams(currentPath: string): URLSearchParams {
  return new URL(oauthRedirectUrl("google", `${ORIGIN}${currentPath}`)).searchParams;
}

describe("provider sign-in return path", () => {
  test("returns to the community page a Join started from", () => {
    const redirect = oauthRedirectUrl("google", `${ORIGIN}/c/harbor?tab=about`);
    expect(redirect).toBe(`${ORIGIN}/auth/sign-in?provider=google&return_to=%2Fc%2Fharbor%3Ftab%3Dabout`);
    expect(signInReturnPath(`${redirect}&code=abc&state=xyz`)).toBe("/c/harbor?tab=about");
  });

  test("keeps the community-creation intent ahead of any return path", () => {
    const params = redirectParams("/communities/new?intent_id=intent_1");
    expect(params.get("community_intent")).toBe("intent_1");
    expect(params.has("return_to")).toBe(false);
    expect(signInReturnPath(`${ORIGIN}/auth/sign-in?community_intent=intent_1&return_to=%2Fc%2Fharbor`))
      .toBe("/communities/new?intent_id=intent_1");
  });

  test("adds no return path when the sign-in started at home", () => {
    expect(redirectParams("/").has("return_to")).toBe(false);
    expect(signInReturnPath(`${ORIGIN}/auth/sign-in?provider=x&code=abc`)).toBe("/");
  });

  test("a retry from the full-page sign-in route carries its validated return on", () => {
    expect(redirectParams("/auth/sign-in?return_to=%2Fc%2Fharbor").get("return_to")).toBe("/c/harbor");
    expect(redirectParams("/auth/sign-in?return_to=https%3A%2F%2Fevil.test").has("return_to")).toBe(false);
    expect(redirectParams("/auth/sign-in").has("return_to")).toBe(false);
  });

  test.each([
    ["an absolute URL", "https://evil.test/c/harbor"],
    ["a protocol-relative URL", "//evil.test/c/harbor"],
    ["a backslash form", "/\\evil.test"],
    ["a scheme", "javascript:alert(1)"],
    ["a relative path", "c/harbor"],
    ["a control character", "/c/harbor\n"],
    ["an auth route", "/auth/sign-in?provider=google"],
    ["the bare auth route", "/auth"],
    ["an empty value", ""],
    ["an overlong value", `/${"a".repeat(2048)}`],
  ])("rejects %s and returns home", (_label, candidate) => {
    expect(safeReturnPath(candidate, ORIGIN)).toBeUndefined();
    const href = `${ORIGIN}/auth/sign-in?${new URLSearchParams({ return_to: candidate }).toString()}`;
    expect(signInReturnPath(href)).toBe("/");
  });

  test("normalizes dot segments without leaving the origin", () => {
    expect(safeReturnPath("/c/../c/harbor", ORIGIN)).toBe("/c/harbor");
    expect(safeReturnPath("/c/../auth/sign-in", ORIGIN)).toBeUndefined();
  });
});
