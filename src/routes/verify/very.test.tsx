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

function button(container: HTMLElement, name: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === name);
}

function presentation(proofSessionId: string): veryApi.VeryWebPresentation {
  return {
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
  };
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

  it("says a link without its community is incomplete and asks for nothing", () => {
    const createCeremony = vi.spyOn(veryApi, "createVeryWebCeremony");
    const container = render(() => <VeryVerificationRoute navigate={vi.fn()} />);

    expect(container.querySelector("[data-route-path='/verify/very']")).not.toBeNull();
    expect(container.textContent).toContain("Join this community");
    expect(container.textContent).toContain("Palm scan with the Very app.");
    expect(container.textContent).toContain("This link is incomplete");
    expect(container.querySelector("input")).toBeNull();
    expect(button(container, "Try again")).toBeUndefined();
    expect(button(container, "Back")).toBeDefined();
    expect(veryApi.resolveVeryCommunityAction).not.toHaveBeenCalled();
    expect(createCeremony).not.toHaveBeenCalled();
  });

  it("uses a reserved creation intent directly and returns without joining or a second tap", async () => {
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
    const navigate = vi.fn();

    const container = render(() => <VeryVerificationRoute navigate={navigate} />);

    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith("/communities/new?intent_id=creation-1"));
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
    expect(container.textContent).toContain("Palm scan done.");
    expect(container.textContent).not.toContain("Proof session");
  });

  it("starts a reward-claim scan from an issued intent and returns to the claim", async () => {
    window.history.replaceState(
      null,
      "",
      "/verify/very?purpose=reward_claim&return_to=%2Fwallet%3Fclaim%3Dcredit-1",
    );
    const issueRewardClaimIntent = vi.fn(async () => "reward-claim_1");
    const createCeremony = vi.spyOn(veryApi, "createVeryWebCeremony").mockResolvedValue({
      cancel: vi.fn(),
      completeWithWidget: vi.fn(),
      initialCompletion: { proofSessionId: "proof-session-2", replayed: false, status: "completed" },
      pollBridge: vi.fn(),
      presentation: undefined,
      proofSessionId: "proof-session-2",
    });
    const navigate = vi.fn();

    const container = render(() => <VeryVerificationRoute issueRewardClaimIntent={issueRewardClaimIntent} navigate={navigate} />);
    expect(container.textContent).toContain("Claim your winnings");

    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith("/wallet?claim=credit-1"));
    expect(issueRewardClaimIntent).toHaveBeenCalledTimes(1);
    expect(createCeremony).toHaveBeenCalledWith({ intentId: "reward-claim_1" });
    expect(veryApi.resolveVeryCommunityAction).not.toHaveBeenCalled();
    expect(veryApi.joinVeryCommunity).not.toHaveBeenCalled();
  });

  it("never returns a reward claim to another origin", async () => {
    window.history.replaceState(null, "", "/verify/very?purpose=reward_claim&return_to=%2F%5Cevil.example");
    vi.spyOn(veryApi, "createVeryWebCeremony").mockResolvedValue({
      cancel: vi.fn(),
      completeWithWidget: vi.fn(),
      initialCompletion: { proofSessionId: "proof-session-3", replayed: false, status: "completed" },
      pollBridge: vi.fn(),
      presentation: undefined,
      proofSessionId: "proof-session-3",
    });
    const navigate = vi.fn();
    const container = render(() => <VeryVerificationRoute issueRewardClaimIntent={async () => "reward-claim_2"} navigate={navigate} />);
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith("/"));
    button(container, "Continue")!.click();
    expect(navigate).toHaveBeenLastCalledWith("/");
    expect(navigate).not.toHaveBeenCalledWith(expect.stringContaining("evil"));
  });

  it("uses the intended-persona Send intent and returns without joining or sending", async () => {
    window.history.replaceState(null, "", "/verify/very?purpose=wallet_send&persona_id=persona_1&return_to=%2Fwallet%3Fsend_return%3Dkey");
    const issueWalletSendIntent = vi.fn(async () => "wallet-send_1");
    const createCeremony = vi.spyOn(veryApi, "createVeryWebCeremony").mockResolvedValue({
      cancel: vi.fn(), completeWithWidget: vi.fn(), pollBridge: vi.fn(), presentation: undefined,
      initialCompletion: { proofSessionId: "proof-send", replayed: false, status: "completed" }, proofSessionId: "proof-send",
    });
    const navigate = vi.fn();
    const container = render(() => <VeryVerificationRoute issueWalletSendIntent={issueWalletSendIntent} navigate={navigate} />);
    expect(container.textContent).toContain("Verify to send");
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith("/wallet?send_return=key"));
    expect(issueWalletSendIntent).toHaveBeenCalledExactlyOnceWith("persona_1");
    expect(createCeremony).toHaveBeenCalledWith({ intentId: "wallet-send_1" });
    expect(veryApi.resolveVeryCommunityAction).not.toHaveBeenCalled();
    expect(veryApi.joinVeryCommunity).not.toHaveBeenCalled();
  });

  it("rejects a Send link without its persona instead of starting a community scan", () => {
    window.history.replaceState(null, "", "/verify/very?purpose=wallet_send&community_id=community_1");
    const issueWalletSendIntent = vi.fn();
    const container = render(() => <VeryVerificationRoute issueWalletSendIntent={issueWalletSendIntent} />);
    expect(container.textContent).toContain("This link is incomplete");
    expect(issueWalletSendIntent).not.toHaveBeenCalled();
    expect(veryApi.resolveVeryCommunityAction).not.toHaveBeenCalled();
  });

  it("rejects an incomplete or legacy creation target without resolving a join", () => {
    window.history.replaceState(null, "", "/verify/very?intent_id=creation-ceremony-1");
    const createCeremony = vi.spyOn(veryApi, "createVeryWebCeremony");

    const container = render(() => <VeryVerificationRoute navigate={vi.fn()} />);

    expect(container.textContent).toContain("This link is incomplete");
    expect(button(container, "Try again")).toBeUndefined();
    expect(container.querySelector("input")).toBeNull();
    expect(createCeremony).not.toHaveBeenCalled();
    expect(veryApi.resolveVeryCommunityAction).not.toHaveBeenCalled();
    expect(veryApi.joinVeryCommunity).not.toHaveBeenCalled();
  });

  it("opens the desktop widget at once, keeps it alive for provider retry and settles duplicate success once", async () => {
    window.history.replaceState(null, "", "/verify/very?community_id=community-gated-1&return_to=%2Fc%2Fharbor");
    const completeWithWidget = vi.fn(async () => ({
      proofSessionId: "proof-session-1",
      status: "completed" as const,
      replayed: false,
    }));
    const cancel = vi.fn();
    const createCeremony = vi.spyOn(veryApi, "createVeryWebCeremony").mockResolvedValue({
      proofSessionId: "proof-session-1",
      presentation: presentation("proof-session-1"),
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
    const navigate = vi.fn();

    const container = render(() => (
      <VeryVerificationRoute loadWidget={async () => ({ createVeryWidget: widgetHarness.create })} mobile={false} navigate={navigate} />
    ));
    // No start control: the page opens the widget itself.
    await vi.waitFor(() => expect(widgetHarness.create).toHaveBeenCalledTimes(1));
    expect(widgetHarness.open).toHaveBeenCalledTimes(1);

    expect(widgetHarness.create).toHaveBeenCalledWith(expect.objectContaining({
      appId: "very-app-staging",
      context: "Veros - Palm Verification Timestamp",
      typeId: "3",
      query: JSON.stringify({ externalNullifier: "Pirate - Community Join" }),
      verifyUrl: "https://verify.very.org/api/v1/verify",
      theme: "dark",
    }));
    expect(container.querySelector("img")).toBeNull();
    expect(button(container, "Open Very")).toBeUndefined();

    widgetConfig?.onError?.("we couldn't find a match");
    await vi.waitFor(() => expect(container.textContent).toContain("Scan your palm in the Very window."));
    expect(createCeremony).toHaveBeenCalledTimes(1);
    expect(completeWithWidget).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(widgetHarness.destroy).not.toHaveBeenCalled();
    expect(document.querySelector(".very-dialog-overlay")).not.toBeNull();

    widgetConfig?.onSuccess("opaque-provider-payload-ref");
    widgetConfig?.onSuccess("duplicate-provider-payload-ref");
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith("/c/harbor"));
    expect(container.textContent).toContain("You joined.");
    expect(container.textContent).not.toContain("community-gated-1");
    expect(completeWithWidget).toHaveBeenCalledTimes(1);
    expect(completeWithWidget).toHaveBeenCalledWith("opaque-provider-payload-ref");
    expect(veryApi.joinVeryCommunity).toHaveBeenCalledWith({ communityId: "community-gated-1", persona: { kind: "existing", persona_id: "persona-a" } });
    expect(widgetHarness.destroy).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
  });

  it("on a phone opens the Very app at once and keeps one Open Very button", async () => {
    window.history.replaceState(null, "", "/verify/very?community_id=community-gated-1");
    const pollBridge = vi.fn(() => new Promise<never>(() => {}));
    vi.spyOn(veryApi, "createVeryWebCeremony").mockResolvedValue({
      proofSessionId: "proof-session-phone",
      presentation: presentation("proof-session-phone"),
      initialCompletion: undefined,
      completeWithWidget: vi.fn(),
      pollBridge,
      cancel: vi.fn(),
    });
    const openApp = vi.fn();

    const container = render(() => (
      <VeryVerificationRoute
        loadWidget={async () => ({ createVeryWidget: widgetHarness.create })}
        mobile
        navigate={vi.fn()}
        openApp={openApp}
      />
    ));

    await vi.waitFor(() => expect(openApp).toHaveBeenCalledWith("veros://verify?sessionId=proof-session-phone&key=YWJj&action=verify"));
    expect(pollBridge).toHaveBeenCalledTimes(1);
    expect(widgetHarness.create).not.toHaveBeenCalled();
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("Waiting for Very. Come back here when you're done.");
    expect(button(container, "Cancel")).toBeDefined();

    // A browser that refused the automatic link still has the tap.
    button(container, "Open Very")!.click();
    expect(openApp).toHaveBeenCalledTimes(2);
    expect(pollBridge).toHaveBeenCalledTimes(1);
  });

  it("joins immediately when an earlier proof already makes the community joinable", async () => {
    window.history.replaceState(null, "", "/verify/very?community_id=community-gated-1");
    vi.mocked(veryApi.resolveVeryCommunityAction).mockResolvedValue({ kind: "join" });
    const createCeremony = vi.spyOn(veryApi, "createVeryWebCeremony");
    const navigate = vi.fn();

    const container = render(() => <VeryVerificationRoute navigate={navigate} />);

    await vi.waitFor(() => expect(container.textContent).toContain("You joined."));
    expect(navigate).toHaveBeenCalledWith("/");
    expect(veryApi.joinVeryCommunity).toHaveBeenCalledWith({ communityId: "community-gated-1", persona: { kind: "existing", persona_id: "persona-a" } });
    expect(createCeremony).not.toHaveBeenCalled();
  });

  it("keeps a failed profile read out of persona selection and retries the join", async () => {
    window.history.replaceState(null, "", "/verify/very?community_id=community-gated-1");
    vi.mocked(sessionApi.resolveSession).mockResolvedValueOnce({ status: "authenticated", userId: "account-a", personas: [], personasUnavailable: true });
    vi.mocked(veryApi.resolveVeryCommunityAction).mockResolvedValue({ kind: "join" });
    const container = render(() => <VeryVerificationRoute navigate={vi.fn()} />);
    await vi.waitFor(() => expect(container.textContent).toContain("Your profiles didn't load. Try again."));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(veryApi.joinVeryCommunity).not.toHaveBeenCalled();
    button(container, "Try again")!.click();
    await vi.waitFor(() => expect(container.textContent).toContain("You joined."));
    expect(veryApi.joinVeryCommunity).toHaveBeenCalledOnce();
  });

  it("prepares an active community profile before a first-time verified join", async () => {
    window.history.replaceState(null, "", "/verify/very?community_id=community-gated-1");
    vi.mocked(sessionApi.resolveSession).mockResolvedValue({ status: "authenticated", userId: "account-a", personas: [] });
    vi.mocked(veryApi.resolveVeryCommunityAction).mockResolvedValue({ kind: "join" });
    let finish: ((profile: sessionApi.ActivePersonaPublicProjection) => void) | undefined;
    const prepareProfile = vi.fn(() => new Promise<sessionApi.ActivePersonaPublicProjection>(resolve => { finish = resolve; }));
    const container = render(() => <VeryVerificationRoute navigate={vi.fn()} prepareProfile={prepareProfile} />);
    await vi.waitFor(() => expect(prepareProfile).toHaveBeenCalledOnce());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(veryApi.joinVeryCommunity).not.toHaveBeenCalled();
    finish!({ personaId: "prepared-active", displayName: null, primaryPublicHandle: null, avatarRef: null, communityBinding: { communityId: "community-gated-1", bindingSource: "activity_participation" } });
    await vi.waitFor(() => expect(veryApi.joinVeryCommunity).toHaveBeenCalledWith({ communityId: "community-gated-1", persona: { kind: "existing", persona_id: "prepared-active" } }));
    await vi.waitFor(() => expect(container.textContent).toContain("You joined."));
  });

  it("waits on a server-reported pending scan without issuing another intent", async () => {
    window.history.replaceState(null, "", "/verify/very?community_id=community-gated-1");
    let resolveNextAction = (_action: veryApi.VeryCommunityAction) => {};
    const nextAction = new Promise<veryApi.VeryCommunityAction>((resolve) => {
      resolveNextAction = resolve;
    });
    vi.mocked(veryApi.resolveVeryCommunityAction)
      .mockResolvedValueOnce({ kind: "wait", retryAfterMs: 1 })
      .mockReturnValueOnce(nextAction);
    const createCeremony = vi.spyOn(veryApi, "createVeryWebCeremony");

    const container = render(() => <VeryVerificationRoute navigate={vi.fn()} />);
    await vi.waitFor(() => expect(container.textContent).toContain("Finishing your last scan…"));
    expect(createCeremony).not.toHaveBeenCalled();

    resolveNextAction({ kind: "join" });
    await vi.waitFor(() => expect(container.textContent).toContain("You joined."));
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
    const navigate = vi.fn();

    const container = render(() => <VeryVerificationRoute navigate={navigate} />);
    await vi.waitFor(() => expect(container.textContent).toContain("Joining…"));
    button(container, "Cancel")!.click();
    resolveJoin({ communityId: "community-gated-1", status: "joined" });

    await vi.waitFor(() => expect(button(container, "Scan your palm")).toBeDefined());
    expect(container.textContent).not.toContain("You joined.");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does not let an old completion clean up a newer widget", async () => {
    window.history.replaceState(null, "", "/verify/very?community_id=community-gated-1");
    let resolveOldCompletion = (_completion: veryApi.VeryWebCompletion) => {};
    const oldCompletion = new Promise<veryApi.VeryWebCompletion>((resolve) => {
      resolveOldCompletion = resolve;
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
      <VeryVerificationRoute loadWidget={async () => ({ createVeryWidget: widgetHarness.create })} mobile={false} navigate={vi.fn()} />
    ));
    await vi.waitFor(() => expect(widgetHarness.create).toHaveBeenCalledTimes(1));
    const oldWidgetConfig = widgetConfig;
    oldWidgetConfig?.onSuccess("old-provider-payload");

    button(container, "Cancel")!.click();
    await vi.waitFor(() => expect(button(container, "Scan your palm")).toBeDefined());
    button(container, "Scan your palm")!.click();
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
      presentation: presentation("proof-session-1"),
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
      <VeryVerificationRoute loadWidget={async () => ({ createVeryWidget: widgetHarness.create })} mobile={false} navigate={vi.fn()} />
    ));
    await vi.waitFor(() => expect(document.querySelector(".very-dialog-overlay")).not.toBeNull());
    document.querySelector(".very-dialog-overlay")?.remove();
    await vi.waitFor(() => expect(container.textContent).toContain("Scan cancelled. Try again."));

    expect(button(container, "Try again")).toBeDefined();
    expect(completeWithWidget).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(widgetHarness.destroy).toHaveBeenCalledTimes(1);
  });

  it("cancels the scan and destroys the widget when the route unmounts", async () => {
    window.history.replaceState(null, "", "/verify/very?community_id=community-gated-1");
    const cancel = vi.fn();
    vi.spyOn(veryApi, "createVeryWebCeremony").mockResolvedValue({
      proofSessionId: "proof-session-1",
      presentation: presentation("proof-session-1"),
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

    render(() => (
      <VeryVerificationRoute loadWidget={async () => ({ createVeryWidget: widgetHarness.create })} mobile={false} navigate={vi.fn()} />
    ));
    await vi.waitFor(() => expect(widgetHarness.create).toHaveBeenCalledTimes(1));

    const dispose = disposers.pop();
    expect(dispose).toBeDefined();
    dispose?.();

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(widgetHarness.destroy).toHaveBeenCalledTimes(1);
  });
});
