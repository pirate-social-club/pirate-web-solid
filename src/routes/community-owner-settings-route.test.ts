import { describe, expect, test, vi } from "vitest";

import { ownerSettingsRequestFetch } from "./c/[path_segment]/settings/[section]";

describe("owner settings route request bridge", () => {
  test("forwards the request cookie into same-origin SSR API calls without copying unrelated headers", async () => {
    const requests: Request[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init));
      return new Response("{}", { headers: { "content-type": "application/json" } });
    });
    const request = new Request("https://web.test/c/harbor/settings/names", {
      headers: {
        authorization: "Bearer must-not-forward",
        cookie: "__Host-pirate_session=session-1; __Host-pirate_csrf=csrf-1",
      },
    });

    await ownerSettingsRequestFetch(request, fetchImpl)("https://web.test/api/communities/community-1/handle-sales-management", {
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]!.headers.get("cookie")).toBe("__Host-pirate_session=session-1; __Host-pirate_csrf=csrf-1");
    expect(requests[0]!.headers.get("authorization")).toBeNull();
    expect(requests[0]!.headers.get("accept")).toBe("application/json");
  });
});
