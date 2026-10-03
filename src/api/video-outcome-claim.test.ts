import { describe, expect, test, vi } from "vitest";
import { claimVideoOutcome, type VideoOutcomeClaim } from "../features/posts/video-outcomes/claim.ts";

import { proxyApiRequest } from "./proxy.ts";

const winner: VideoOutcomeClaim = { object: "video_outcome_claim", display_permission: true,
  outcome: { submission_id: "submission", kind: "processing_failure", song: { community_id: "song-community", post_id: "song-post" } } };

describe("reviewed permanent video outcome claim transport", () => {
  test("posts exactly {} to the same-origin API with session credentials and CSRF", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(winner), { headers: { "content-type": "application/json" } }));
    expect(await claimVideoOutcome({ origin: "https://web.pirate.test", fetchImpl, csrfToken: "csrf" })).toEqual(winner);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [input, init] = fetchImpl.mock.calls[0]!;
    expect(String(input)).toBe("https://web.pirate.test/api/video-outcomes/claim");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe("{}");
    expect(init?.credentials).toBe("same-origin");
    expect(new Headers(init?.headers).get("x-csrf-token")).toBe("csrf");
    expect(new Headers(init?.headers).has("authorization")).toBe(false);
  });

  test("the host proxy preserves exact browser Origin, host-only cookies and CSRF on the claim", async () => {
    const request = new Request("https://web.pirate.test/api/video-outcomes/claim", { method: "POST", body: "{}", headers: {
      origin: "https://web.pirate.test", cookie: "__Host-pirate_session=session; __Host-pirate_csrf=csrf", "x-csrf-token": "csrf", "content-type": "application/json",
    } });
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(winner)));
    const response = await proxyApiRequest(request, { API_NEXT_ORIGIN: "https://api-next.pirate.test" }, { fetchImpl });
    expect(response.status).toBe(200); expect(fetchImpl).toHaveBeenCalledOnce();
    const [input, init] = fetchImpl.mock.calls[0]!;
    expect(String(input)).toBe("https://api-next.pirate.test/video-outcomes/claim");
    const headers = new Headers(init?.headers);
    expect(headers.get("origin")).toBe("https://web.pirate.test");
    expect(headers.get("cookie")).toBe("__Host-pirate_session=session; __Host-pirate_csrf=csrf");
    expect(headers.get("x-csrf-token")).toBe("csrf");
    expect(await new Response(init?.body).text()).toBe("{}");
  });

  test.each(["published", "processing", "retryable", "acceptance_unknown"])("generated contract refuses a %s outcome", async kind => {
    const invalid = { ...winner, outcome: { ...winner.outcome, kind } };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(invalid), { headers: { "content-type": "application/json" } }));
    await expect(claimVideoOutcome({ origin: "https://web.pirate.test", fetchImpl, csrfToken: "csrf" })).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  test.each([
    { object: "video_outcome_claim", display_permission: true, outcome: null },
    { ...winner, display_permission: false },
  ])("generated discriminant rejects inconsistent permission and payload", async invalid => {
    await expect(claimVideoOutcome({ origin: "https://web.pirate.test", csrfToken: "csrf", fetchImpl: async () => new Response(JSON.stringify(invalid)) })).rejects.toThrow();
  });

  test("a lost successful reply makes one request with no recovery retry", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("response lost after commit"); });
    await expect(claimVideoOutcome({ origin: "https://web.pirate.test", fetchImpl, csrfToken: "csrf" })).rejects.toThrow("response lost");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  test("missing CSRF cannot dispatch", async () => {
    const post_videoOutcomesClaim = vi.fn();
    await expect(claimVideoOutcome({ client: { post_videoOutcomesClaim } })).rejects.toThrow("CSRF");
    expect(post_videoOutcomesClaim).not.toHaveBeenCalled();
  });
});
