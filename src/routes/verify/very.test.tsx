import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import type { JSX } from "@solidjs/web";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as veryApi from "../../api/very.ts";
import * as sessionApi from "../../api/session.ts";
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

beforeEach(() => {
  vi.spyOn(sessionApi, "resolveSession").mockResolvedValue({ status: "authenticated", userId: "account-a", personas: [{
    personaId: "persona-a", displayName: "Persona A", avatarRef: null, primaryPublicHandle: null,
    communityBinding: { communityId: "community-gated-1", bindingSource: "first_membership" },
  }] });
  vi.spyOn(sessionApi, "refreshSession").mockImplementation(() => {});
  vi.spyOn(veryApi, "resolveVeryCommunityAction").mockResolvedValue({
    kind: "verify",
    intentId: "community-join-intent-1",
  });
  vi.spyOn(veryApi, "joinVeryCommunity").mockImplementation(async ({ communityId }) => ({
    communityId,
    status: "joined",
  }));
});

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

  it("uses a reserved creation intent directly and returns without joining", async () => {
    window.history.replaceState(
      null,
      "",
      "/verify/very?creation_intent_id=creation-1&ceremony_intent_id=creation-ceremony-1&provider_id=very.web&requirement=human_identity&generation=3&expected_revision=7&return_to=%2Fcommunities%2Fnew%3Fintent_id%3Dcreation-1",
    );
    const createCeremony = vi.spyOn(veryApi, "createVeryWebCeremony").mockResolvedValue({
      cancel: vi.fn(),
      completeWithWidget: vi.fn(),
      initialCompletion: {
        proofSessionId: "proof-session-1",
        replayed: true,
        status: "completed",
      },
      pollBridge: vi.fn(),
      presentation: undefined,
      proofSessionId: "proof-session-1",
    });

    const container = render(() => <VeryVerificationRoute />);
    expect(container.textContent).not.toContain("Gated community ID");
    container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await vi.waitFor(() => expect(container.textContent).toContain("Verification complete"));
    expect(createCeremony).toHaveBeenCalledWith({
      creation: {
        creationIntentId: "creation-1",
        ceremonyIntentId: "creation-ceremony-1",
        providerId: "very.web",
        requirement: "human_identity",
        generation: 3,
        expectedRevision: 7,
      },
    });
    expect(veryApi.resolveVeryCommunityAction).not.toHaveBeenCalled();
    expect(veryApi.joinVeryCommunity).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Continue");
  });

  it("rejects an incomplete or legacy creation target without resolving a join", () => {
    window.history.replaceState(null, "", "/verify/very?intent_id=creation-ceremony-1");
    const createCeremony = vi.spyOn(veryApi, "createVeryWebCeremony");

    const container = render(() => <VeryVerificationRoute />);

    expect(container.textContent).toContain("creation verification link is invalid");
    expect(container.textContent).not.toContain("Gated community ID");
    expect(container.textContent).not.toContain("Start palm verification");
    expect(createCeremony).not.toHaveBeenCalled();
    expect(veryApi.resolveVeryCommunityAction).not.toHaveBeenCalled();
    expect(veryApi.joinVeryCommunity).not.toHaveBeenCalled();
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
    await vi.waitFor(() => expect(container.textContent).toContain("Community joined"));
    expect(completeWithWidget).toHaveBeenCalledTimes(1);
    expect(completeWithWidget).toHaveBeenCalledWith("opaque-provider-payload-ref");
    expect(veryApi.joinVeryCommunity).toHaveBeenCalledWith({ communityId: "community-gated-1", persona: { kind: "existing", persona_id: "persona-a" } });
    expect(widgetHarness.destroy).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
  });

  it("joins immediately when an earlier proof already makes the community joinable", async () => {
    window.history.replaceState(null, "", "/verify/very?community_id=community-gated-1");
    vi.mocked(veryApi.resolveVeryCommunityAction).mockResolvedValue({ kind: "join" });
    const createCeremony = vi.spyOn(veryApi, "createVeryWebCeremony");

    const container = render(() => <VeryVerificationRoute />);
    container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await vi.waitFor(() => expect(container.textContent).toContain("Community joined"));
    expect(veryApi.joinVeryCommunity).toHaveBeenCalledWith({ communityId: "community-gated-1", persona: { kind: "existing", persona_id: "persona-a" } });
    expect(createCeremony).not.toHaveBeenCalled();
  });

  it("explains and confirms a zero-candidate mint before sending the join", async () => {
    window.history.replaceState(null, "", "/verify/very?community_id=community-gated-1");
    vi.mocked(sessionApi.resolveSession).mockResolvedValue({ status: "authenticated", userId: "account-a", personas: [] });
    vi.mocked(veryApi.resolveVeryCommunityAction).mockResolvedValue({ kind: "join" });
    const container = render(() => <VeryVerificationRoute />);
    container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    expect(container.textContent).toContain("Choose your public identity");
    expect(container.textContent).not.toContain("Joining the community…");
    expect(veryApi.joinVeryCommunity).not.toHaveBeenCalled();
    const confirm = Array.from(document.querySelectorAll("button")).find(button => button.textContent?.includes("Create persona and join"));
    expect(confirm).toBeDefined();
    confirm?.click();
    await vi.waitFor(() => expect(container.textContent).toContain("Community joined"));
    expect(veryApi.joinVeryCommunity).toHaveBeenCalledWith({ communityId: "community-gated-1", persona: { kind: "create_new" } });
  });

  it("waits on a server-reported pending ceremony without issuing another intent", async () => {
    window.history.replaceState(null, "", "/verify/very?community_id=community-gated-1");
    let resolveNextAction = (_action: veryApi.VeryCommunityAction) => {};
    const nextAction = new Promise<veryApi.VeryCommunityAction>((resolve) => {
      resolveNextAction = resolve;
    });
    vi.mocked(veryApi.resolveVeryCommunityAction)
      .mockResolvedValueOnce({ kind: "wait", retryAfterMs: 1 })
      .mockReturnValueOnce(nextAction);
    const createCeremony = vi.spyOn(veryApi, "createVeryWebCeremony");

    const container = render(() => <VeryVerificationRoute />);
    container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => expect(container.textContent).toContain("prior Very ceremony is still pending"));
    expect(createCeremony).not.toHaveBeenCalled();

    resolveNextAction({ kind: "join" });
    await vi.waitFor(() => expect(container.textContent).toContain("Community joined"));
    expect(veryApi.resolveVeryCommunityAction).toHaveBeenCalledTimes(2);
    expect(createCeremony).not.toHaveBeenCalled();
  });

  it("does not apply a delayed join result after the operation is cancelled", async () => {
    window.history.replaceState(null, "", "/verify/very?community_id=community-gated-1");
    vi.mocked(veryApi.resolveVeryCommunityAction).mockResolvedValue({ kind: "join" });
    let resolveJoin = (_joined: veryApi.VeryCommunityJoin) => {};
    vi.mocked(veryApi.joinVeryCommunity).mockReturnValue(new Promise((resolve) => {
      resolveJoin = resolve;
    }));

    const container = render(() => <VeryVerificationRoute />);
    container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => expect(container.textContent).toContain("Joining the community"));
    const cancel = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Cancel");
    cancel?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    resolveJoin({ communityId: "community-gated-1", status: "joined" });

    await vi.waitFor(() => expect(container.textContent).toContain("Start palm verification"));
    expect(container.textContent).not.toContain("Community joined");
  });

  it("does not let an old completion clean up a newer widget", async () => {
    window.history.replaceState(null, "", "/verify/very?community_id=community-gated-1");
    let resolveOldCompletion = (_completion: veryApi.VeryWebCompletion) => {};
    const oldCompletion = new Promise<veryApi.VeryWebCompletion>((resolve) => {
      resolveOldCompletion = resolve;
    });
    const presentation = (proofSessionId: string): veryApi.VeryWebPresentation => ({
      proofSessionId,
      expiresAt: "2099-08-20T12:05:00.000Z",
      appId: "very-app-staging",
      apiUrl: "https://bridge.very.org/api/v1",
      context: "Veros - Palm Verification Timestamp",
      typeId: "3",
      query: JSON.stringify({ externalNullifier: "Pirate - Community Join" }),
      verifyUrl: "https://verify.very.org/api/v1/verify",
      mobileUri: `veros://verify?sessionId=${proofSessionId}&key=YWJj&action=verify`,
      pollUrl: `/verification/sessions/${proofSessionId}/complete`,
    });
    vi.spyOn(veryApi, "createVeryWebCeremony")
      .mockResolvedValueOnce({
        proofSessionId: "proof-session-old",
        presentation: presentation("proof-session-old"),
        initialCompletion: undefined,
        completeWithWidget: vi.fn(() => oldCompletion),
        pollBridge: vi.fn(),
        cancel: vi.fn(),
      })
      .mockResolvedValueOnce({
        proofSessionId: "proof-session-new",
        presentation: presentation("proof-session-new"),
        initialCompletion: undefined,
        completeWithWidget: vi.fn(),
        pollBridge: vi.fn(),
        cancel: vi.fn(),
      });
    widgetHarness.create.mockImplementation((config: WidgetConfig) => {
      widgetConfig = config;
      return {
        open: () => {
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
    container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => expect(widgetHarness.create).toHaveBeenCalledTimes(1));
    const oldWidgetConfig = widgetConfig;
    oldWidgetConfig?.onSuccess("old-provider-payload");

    const cancel = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Cancel");
    cancel?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => expect(container.textContent).toContain("Start palm verification"));
    container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => expect(widgetHarness.create).toHaveBeenCalledTimes(2));
    expect(widgetHarness.destroy).toHaveBeenCalledTimes(1);

    resolveOldCompletion({ proofSessionId: "proof-session-old", status: "completed", replayed: false });
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    expect(widgetHarness.destroy).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".very-dialog-overlay")).not.toBeNull();
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
