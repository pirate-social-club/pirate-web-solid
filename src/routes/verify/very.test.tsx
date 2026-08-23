import { afterEach, describe, expect, it, vi } from "vitest";
import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import type { JSX } from "@solidjs/web";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as veryApi from "../../api/very.ts";
import VeryVerificationRoute from "./very.tsx";

type WidgetConfig = {
  appId: string;
  context: string;
  typeId: string;
  query: string;
  verifyUrl?: string;
  onSuccess: (providerPayloadRef: string) => void;
  onError?: (error: string) => void;
  theme?: "default" | "light" | "dark";
};

type WidgetInstance = {
  open: () => void;
  destroy: () => void;
};

type WidgetHarness = {
  create: ReturnType<typeof vi.fn<(config: WidgetConfig) => WidgetInstance>>;
  open: ReturnType<typeof vi.fn<() => void>>;
  destroy: ReturnType<typeof vi.fn<() => void>>;
};

const widgetHarness = {
  create: vi.fn<(config: WidgetConfig) => WidgetInstance>(),
  open: vi.fn(),
  destroy: vi.fn(),
} satisfies WidgetHarness;
let widgetConfig: WidgetConfig | undefined;

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
  for (const dispose of disposers.splice(0)) dispose();
  vi.restoreAllMocks();
  widgetHarness.create.mockReset();
  widgetHarness.open.mockReset();
  widgetHarness.destroy.mockReset();
  widgetConfig = undefined;
  window.history.replaceState(null, "", "/verify/very");
  document.body.replaceChildren();
  document.head.replaceChildren();
});

describe("Very verification route", () => {
  it("pins the private overlay contract used to detect widget dismissal", () => {
    const packageRoot = resolve(process.cwd(), "node_modules/@veryai/widget");
    const manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
    const widgetSource = readFileSync(resolve(packageRoot, "build/index.mjs"), "utf8");

    expect(manifest).toMatchObject({ version: "1.0.22" });
    expect(widgetSource).toContain('this.overlay.className = "very-dialog-overlay"');
    expect(widgetSource).toContain("createErrorElement(state.errorText, () => this.refresh())");
  });

  it("renders a guarded start screen for a gated community", () => {
    const container = render(() => <VeryVerificationRoute />);
    expect(container.querySelector("[data-route-path='/verify/very']")).not.toBeNull();
    expect(container.textContent).toContain("Very palm verification");
    expect(container.textContent).toContain("Gated community ID");
    expect(container.textContent).toContain("server resolves the one-time verification intent");
    expect(container.textContent).toContain("Start palm verification");
  });

  it("keeps the widget alive for provider retry and settles duplicate success once", async () => {
    window.history.replaceState(null, "", "/verify/very?community_id=community-gated-1");
    const completeWithWidget = vi.fn(async () => ({
      proofSessionId: "proof-session-1",
      status: "completed" as const,
      replayed: false,
    }));
    const cancel = vi.fn();
    const createCeremony = vi.spyOn(veryApi, "createVeryWebCeremony").mockResolvedValue({
      proofSessionId: "proof-session-1",
      presentation: {
        proofSessionId: "proof-session-1",
        expiresAt: "2099-08-20T12:05:00.000Z",
        appId: "very-app-staging",
        apiUrl: "https://bridge.very.org/api/v1",
        context: "Veros - Palm Verification Timestamp",
        typeId: "3",
        query: JSON.stringify({ externalNullifier: "Pirate - Community Join" }),
        verifyUrl: "https://verify.very.org/api/v1/verify",
        mobileUri: "veros://verify?sessionId=bridge-session-1&key=YWJj&action=verify",
        pollUrl: "/verification/sessions/proof-session-1/complete",
      },
      initialCompletion: undefined,
      completeWithWidget,
      pollBridge: vi.fn(),
      cancel,
    });
    widgetHarness.create.mockImplementation((config: WidgetConfig) => {
      widgetConfig = config;
      return {
        open: () => {
          widgetHarness.open();
          const overlay = document.createElement("div");
          overlay.className = "very-dialog-overlay";
          document.body.appendChild(overlay);
        },
        destroy: () => {
          widgetHarness.destroy();
          document.querySelector(".very-dialog-overlay")?.remove();
        },
      };
    });

    const container = render(() => (
      <VeryVerificationRoute loadWidget={async () => ({ createVeryWidget: widgetHarness.create })} />
    ));
    await vi.waitFor(() => expect(container.querySelector("button")?.textContent).toContain("Start"));
    container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => expect(widgetHarness.create).toHaveBeenCalledTimes(1));

    expect(widgetHarness.create).toHaveBeenCalledWith(expect.objectContaining({
      appId: "very-app-staging",
      context: "Veros - Palm Verification Timestamp",
      typeId: "3",
      query: JSON.stringify({ externalNullifier: "Pirate - Community Join" }),
      verifyUrl: "https://verify.very.org/api/v1/verify",
      theme: "dark",
    }));
    expect(container.querySelector("img")).toBeNull();

    widgetConfig?.onError?.("we couldn't find a match");
    await vi.waitFor(() => expect(container.textContent).toContain("widget is open"));
    expect(createCeremony).toHaveBeenCalledTimes(1);
    expect(completeWithWidget).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(widgetHarness.destroy).not.toHaveBeenCalled();
    expect(document.querySelector(".very-dialog-overlay")).not.toBeNull();

    widgetConfig?.onSuccess("opaque-provider-payload-ref");
    widgetConfig?.onSuccess("duplicate-provider-payload-ref");
    await vi.waitFor(() => expect(container.textContent).toContain("Verification complete"));
    expect(completeWithWidget).toHaveBeenCalledTimes(1);
    expect(completeWithWidget).toHaveBeenCalledWith("opaque-provider-payload-ref");
    expect(widgetHarness.destroy).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
  });

  it("settles a widget dismissal without completing the server session", async () => {
    window.history.replaceState(null, "", "/verify/very?community_id=community-gated-1");
    const completeWithWidget = vi.fn();
    const cancel = vi.fn();
    vi.spyOn(veryApi, "createVeryWebCeremony").mockResolvedValue({
      proofSessionId: "proof-session-1",
      presentation: {
        proofSessionId: "proof-session-1",
        expiresAt: "2099-08-20T12:05:00.000Z",
        appId: "very-app-staging",
        apiUrl: "https://bridge.very.org/api/v1",
        context: "Veros - Palm Verification Timestamp",
        typeId: "3",
        query: "{\"externalNullifier\":\"Pirate - Community Join\"}",
        verifyUrl: "https://verify.very.org/api/v1/verify",
        mobileUri: "veros://verify?sessionId=bridge-session-1&key=YWJj&action=verify",
        pollUrl: "/verification/sessions/proof-session-1/complete",
      },
      initialCompletion: undefined,
      completeWithWidget,
      pollBridge: vi.fn(),
      cancel,
    });
    widgetHarness.create.mockImplementation((config: WidgetConfig) => {
      widgetConfig = config;
      return {
        open: () => {
          const overlay = document.createElement("div");
          overlay.className = "very-dialog-overlay";
          document.body.appendChild(overlay);
        },
        destroy: widgetHarness.destroy,
      };
    });

    const container = render(() => (
      <VeryVerificationRoute loadWidget={async () => ({ createVeryWidget: widgetHarness.create })} />
    ));
    container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => expect(document.querySelector(".very-dialog-overlay")).not.toBeNull());
    document.querySelector(".very-dialog-overlay")?.remove();
    await vi.waitFor(() => expect(container.textContent).toContain("dismissed"));

    expect(completeWithWidget).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(widgetHarness.destroy).toHaveBeenCalledTimes(1);
  });

  it("cancels the ceremony and destroys the widget when the route unmounts", async () => {
    window.history.replaceState(null, "", "/verify/very?community_id=community-gated-1");
    const cancel = vi.fn();
    vi.spyOn(veryApi, "createVeryWebCeremony").mockResolvedValue({
      proofSessionId: "proof-session-1",
      presentation: {
        proofSessionId: "proof-session-1",
        expiresAt: "2099-08-20T12:05:00.000Z",
        appId: "very-app-staging",
        apiUrl: "https://bridge.very.org/api/v1",
        context: "Veros - Palm Verification Timestamp",
        typeId: "3",
        query: "{\"externalNullifier\":\"Pirate - Community Join\"}",
        verifyUrl: "https://verify.very.org/api/v1/verify",
        mobileUri: "veros://verify?sessionId=bridge-session-1&key=YWJj&action=verify",
        pollUrl: "/verification/sessions/proof-session-1/complete",
      },
      initialCompletion: undefined,
      completeWithWidget: vi.fn(),
      pollBridge: vi.fn(),
      cancel,
    });
    widgetHarness.create.mockImplementation(() => ({
      open: () => {
        const overlay = document.createElement("div");
        overlay.className = "very-dialog-overlay";
        document.body.appendChild(overlay);
      },
      destroy: () => {
        widgetHarness.destroy();
        document.querySelector(".very-dialog-overlay")?.remove();
      },
    }));

    const container = render(() => (
      <VeryVerificationRoute loadWidget={async () => ({ createVeryWidget: widgetHarness.create })} />
    ));
    container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => expect(widgetHarness.create).toHaveBeenCalledTimes(1));

    const dispose = disposers.pop();
    expect(dispose).toBeDefined();
    dispose?.();

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(widgetHarness.destroy).toHaveBeenCalledTimes(1);
  });
});
