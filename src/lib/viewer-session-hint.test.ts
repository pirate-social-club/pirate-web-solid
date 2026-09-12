import { describe, expect, it } from "vitest";

import { viewerSessionHint } from "./viewer-session-hint.ts";

function hintForCookie(cookie: string | undefined): boolean {
  return viewerSessionHint(new Request("https://pirate.test/c/example", cookie === undefined ? undefined : { headers: { cookie } }));
}

describe("viewer session first-paint hint", () => {
  it("recognises the exact host-prefixed session cookie", () => {
    expect(hintForCookie("__Host-pirate_session=x")).toBe(true);
    expect(hintForCookie("theme=dark; __Host-pirate_session=x; locale=en")).toBe(true);
  });

  it("rejects suffix lookalikes, the bare legacy name and malformed pairs", () => {
    expect(hintForCookie("x__Host-pirate_session=y")).toBe(false);
    expect(hintForCookie("n-pirate_session=y")).toBe(false);
    expect(hintForCookie("__Host-pirate_session_extra=z")).toBe(false);
    expect(hintForCookie("__Host-pirate_session")).toBe(false);
    expect(hintForCookie(undefined)).toBe(false);
  });
});
