import { describe, expect, test } from "vitest";
import { guestRequestOptions, readGuestCsrfCookie } from "./guest-browser-client.ts";

const csrf = "A".repeat(43);

describe("separate guest browser CSRF", () => {
  test("ignores account CSRF and reads only the correctly named guest token", () => {
    expect(readGuestCsrfCookie(`__Host-pirate_csrf=${csrf}`)).toBeUndefined();
    expect(readGuestCsrfCookie(`__Host-pirate_csrf=account; __Host-pirate_guest_csrf=${csrf}; setting=value`)).toBe(csrf);
    const controller = new AbortController();
    const options = guestRequestOptions(csrf, controller.signal);
    expect(options.credentials).toBe("same-origin");
    expect(options.signal).toBe(controller.signal);
    expect(options.headers).toEqual({ "x-guest-csrf-token": csrf });
  });

  test.each([
    `__Host-pirate_guest_csrf=${csrf}; __Host-pirate_guest_csrf=${csrf}`,
    `__Host-pirate_guest_csrf; __Host-pirate_guest_csrf=${csrf}`,
    "__Host-pirate_guest_csrf=",
    "__Host-pirate_guest_csrf=not-a-canonical-token",
    `__Host-pirate_guest_csrf=${"A".repeat(42)}B`,
    `setting=${"é".repeat(8_192)}; __Host-pirate_guest_csrf=${csrf}`,
  ])("refuses malformed, duplicate or over-bound readable cookies", cookie => {
    expect(readGuestCsrfCookie(cookie)).toBeUndefined();
  });
});
