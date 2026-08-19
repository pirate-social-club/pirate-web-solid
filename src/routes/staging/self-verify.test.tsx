import { afterEach, describe, expect, test, vi } from "vitest";
import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import type { JSX } from "@solidjs/web";

import StagingSelfVerifyRoute from "./self-verify.tsx";

const disposers: Array<() => void> = [];

function render(ui: () => JSX.Element): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let dispose = () => {};
  createRoot(rootDispose => {
    dispose = rootDispose;
    solidRender(ui, container);
  });
  disposers.push(() => {
    dispose();
    container.remove();
  });
  return container;
}

afterEach(() => {
  vi.unstubAllGlobals();
  while (disposers.length > 0) disposers.pop()?.();
});

describe("staging Self verification harness route", () => {
  test("explains when the verification harness is unavailable", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 404 }));
    const container = render(() => <StagingSelfVerifyRoute />);
    await vi.waitFor(() => {
      expect(container.textContent).toContain("not enabled in this environment");
    });
  });

  test("offers sign-in when the session is anonymous", async () => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/internal/verification/config")) {
        return Response.json({ enabled: true, privyAppId: "privy-test" });
      }
      return new Response(
        JSON.stringify({
          error: { code: "auth_error", message: "Authentication required", retryable: false },
          request_id: "req-test",
        }),
        { status: 401, headers: { "content-type": "application/json" } },
      );
    });
    const container = render(() => <StagingSelfVerifyRoute />);
    await vi.waitFor(() => {
      expect(container.textContent).toContain("Sign in");
    });
    expect(container.textContent).toContain("staging test email");
  });
});
