import { ApplicationSessionProvider, type ApplicationSessionState } from "../shell/application-session.tsx";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@solidjs/web";
import { createRoot, createSignal } from "solid-js";
import { RewardSponsorDialog } from "./reward-sponsor-dialog.tsx";
import { rewardSponsorFixture } from "./reward-sponsor.fixtures.ts";
import { createRewardCreation } from "../../api/reward-creation.ts";
import { sponsorTerms } from "./reward-sponsor-terms.ts";
const disposers: Array<() => void> = [];
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); document.body.replaceChildren(); });
function button(text: string) {
  const found = Array.from(document.querySelectorAll("button")).find(element => element.textContent === text);
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}
function radio(text: string) {
  const found = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find(element => element.textContent?.includes(text));
  if (!found) throw new Error(`Missing radio: ${text}`);
  return found;
}
function fill(label: string, value: string) {
  const labelElement = Array.from(document.querySelectorAll("label")).find(element => element.textContent?.startsWith(label));
  const input = labelElement?.querySelector("input") ?? document.getElementById(labelElement?.htmlFor ?? "");
  if (!(input instanceof HTMLInputElement)) throw new Error(`Missing input: ${label}`);
  input.value = value; input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true }));
}
describe("composed sponsor journey", () => {
  it("adds a reward to a zero-leg existing offer without opening another offer", async () => {
    const fixture = rewardSponsorFixture();
    const fixtureApi = fixture.creationApi({ accountId: "account", personaId: "persona" });
    const open = vi.fn(async () => {
      throw new Error("must not open another offer");
    });
    const add = vi.fn(fixtureApi.add);
    const existing = { offer_id: "existing-offer" };
    const dependencies = {
      ...fixture,
      data: {
        ...fixture.data,
        async sponsorContext() {
          return {
            offer: existing,
            permissions: {
              add_asset_bonus: { allowed: true as const, reason: null },
              add_megapot_pool: { allowed: true as const, reason: null },
            },
          };
        },
      },
      creationApi: () => ({ open, add }),
    };
    const root = document.createElement("div");
    document.body.appendChild(root);
    createRoot(dispose => {
      disposers.push(dispose);
      render(() => (
        <RewardSponsorDialog
          communityId="community"
          postId="song"
          songTitle="Salt & Static"
          dependencies={dependencies}
          onClose={() => {}}
        />
      ), root);
    });
    await vi.waitFor(() => expect(document.body.textContent).toContain("joins the existing offer"));
    fill("Total budget", "18");
    fill("Maximum ticket price", "1");
    await new Promise(resolve => setTimeout(resolve, 0));
    button("Review terms").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Create reward"));
    button("Create reward").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Send code"));
    expect(open).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalledOnce();
    expect(add.mock.calls[0]?.[0].input.path.offerId).toBe("existing-offer");
  });

  it("archives confirmed creation before adding a second reward to the same offer", async () => {
    const fixture = rewardSponsorFixture();
    const fixtureApi = fixture.creationApi({ accountId: "account", personaId: "persona" });
    let offerOpened = false;
    const open = vi.fn(async (input: Parameters<typeof fixtureApi.open>[0]) => {
      offerOpened = true;
      return await fixtureApi.open(input);
    });
    const add = vi.fn(fixtureApi.add);
    const permissions = {
      add_asset_bonus: { allowed: true as const, reason: null },
      add_megapot_pool: { allowed: true as const, reason: null },
    };
    const dependencies = {
      ...fixture,
      data: {
        ...fixture.data,
        async sponsorContext() {
          return {
            offer: offerOpened ? { offer_id: "offer" } : null,
            permissions,
          };
        },
      },
      creationApi: () => ({ open, add }),
    };
    const root = document.createElement("div");
    document.body.appendChild(root);
    createRoot(dispose => {
      disposers.push(dispose);
      render(() => (
        <RewardSponsorDialog
          communityId="community"
          postId="song"
          songTitle="Salt & Static"
          dependencies={dependencies}
          onClose={() => {}}
        />
      ), root);
    });
    await vi.waitFor(() => expect(document.body.textContent).toContain("Review terms"));
    fill("Total budget", "18");
    fill("Maximum ticket price", "1");
    fill("Offer ends", "2099-09-15T12:00");
    await new Promise(resolve => setTimeout(resolve, 0));
    button("Review terms").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Create reward"));
    button("Create reward").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Send code"));
    fill("Email for your wallet", "sponsor@example.test");
    await new Promise(resolve => setTimeout(resolve, 0));
    button("Send code").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Code"));
    fill("Code", "123456");
    await new Promise(resolve => setTimeout(resolve, 0));
    button("Review transfer").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Confirm transfer"));
    button("Confirm transfer").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Funding confirmed"));
    button("Add another reward").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("joins the existing offer"));
    radio("Token bonus").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Amount per person"));
    fill("Amount per person", "1");
    fill("Number of recipients", "10");
    await new Promise(resolve => setTimeout(resolve, 0));
    button("Review terms").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Create reward"));
    button("Create reward").click();
    await vi.waitFor(() => expect(add).toHaveBeenCalledTimes(2));
    expect(open).toHaveBeenCalledOnce();
    expect(add.mock.calls[1]?.[0].input.path.offerId).toBe("offer");
  });

  it("renders a saved creation as resumable and does not confirm or broadcast on resume", async () => {
    const dependencies = rewardSponsorFixture();
    const catalog = await dependencies.data.catalog();
    const scope = { accountId: "account", personaId: "persona", communityId: "community", postId: "song" };
    const reviewed = sponsorTerms(scope, {
      kind: "megapot_pool", amount: "18", perClaim: "", claims: "10", assetAddress: "",
      activities: "either", minimumScore: "70", ticketCeiling: "1", cutoffSeconds: "60",
      endsAt: "2099-09-15T12:00",
    }, catalog.assets.items, catalog.policies, new Date("2026-09-08T00:00:00Z"));
    const creationApi = dependencies.creationApi(scope);
    await createRewardCreation({
      scope, currentScope: () => scope, journal: dependencies.journal, api: creationApi,
    }).start(reviewed.offer, reviewed.leg);

    let confirm: ReturnType<typeof vi.spyOn> | undefined;
    const funding = dependencies.funding;
    const root = document.createElement("div"); document.body.appendChild(root);
    createRoot(dispose => {
      disposers.push(dispose);
      render(() => <RewardSponsorDialog communityId="community" postId="song" songTitle="Salt & Static" dependencies={{
        ...dependencies,
        funding: async options => {
          const bridge = await funding(options);
          confirm = vi.spyOn(bridge.controller, "confirm");
          return bridge;
        },
      }} onClose={() => {}} />,root);
    });
    await vi.waitFor(() => expect(document.body.textContent).toContain("Resume saved reward"));
    button("Resume saved reward").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Send code"));
    expect(confirm).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Confirm transfer");
  });

  it("attempts an unconfirmed permission and surfaces the server refusal", async () => {
    const fixture = rewardSponsorFixture();
    const open = vi.fn(async () => { throw new Error("owner-only"); });
    const dependencies = {
      ...fixture,
      data: {
        ...fixture.data,
        async sponsorContext() {
          return {
            offer: null,
            permissions: {
              add_asset_bonus: { allowed: "unconfirmed" as const, reason: null },
              add_megapot_pool: { allowed: "unconfirmed" as const, reason: null },
            },
          };
        },
      },
      creationApi: () => ({ open, add: async () => { throw new Error("unexpected add"); } }),
    };
    const root = document.createElement("div");
    document.body.appendChild(root);
    createRoot(dispose => {
      disposers.push(dispose);
      render(() => (
        <RewardSponsorDialog communityId="community" postId="song" songTitle="Salt & Static" dependencies={dependencies} onClose={() => {}} />
      ), root);
    });
    await vi.waitFor(() => expect(document.body.textContent).toContain("Review terms"));
    fill("Total budget", "18");
    fill("Maximum ticket price", "1");
    fill("Offer ends", "2099-09-15T12:00");
    await new Promise(resolve => setTimeout(resolve, 0));
    button("Review terms").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Create reward"));
    button("Create reward").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("This step could not be completed"));
    expect(open).toHaveBeenCalledOnce();
  });

  it("closes and disposes private presentation when the application account changes", async () => {
    const dependencies = rewardSponsorFixture(), close = vi.fn();
    const root = document.createElement("div"); document.body.appendChild(root);
    const [session,setSession] = createSignal<ApplicationSessionState>({ status: "authenticated", userId: "account" });
    createRoot(dispose => { disposers.push(dispose); render(() => <ApplicationSessionProvider state={session}><RewardSponsorDialog communityId="community" postId="song" songTitle="Salt & Static" dependencies={dependencies} onClose={close} /></ApplicationSessionProvider>,root); });
    await vi.waitFor(() => expect(document.body.textContent).toContain("Review terms"));
    setSession({ status: "authenticated", userId: "other-account" });
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
  });

  it.each(["megapot_pool", "asset_bonus"] as const)("creates %s once and requires explicit transfer approval", async kind => {
    const dependencies = rewardSponsorFixture();
    const createApi = dependencies.creationApi({ accountId: "account", personaId: "persona" });
    const add = vi.spyOn(createApi,"add"), open = vi.spyOn(createApi,"open");
    const root = document.createElement("div"); document.body.appendChild(root);
    createRoot(dispose => { disposers.push(dispose); render(() => <RewardSponsorDialog communityId="community" postId="song" songTitle="Salt & Static" dependencies={{ ...dependencies, creationApi: () => createApi }} onClose={() => {}} />,root); });
    await vi.waitFor(() => expect(document.body.textContent).toContain("Review terms"));
    if (kind === "asset_bonus") {
      radio("Token bonus").click();
      await vi.waitFor(() => expect(document.body.textContent).toContain("Amount per person"));
      fill("Amount per person", "1"); fill("Number of recipients", "10");
      expect(document.body.textContent).not.toContain("Additional score floor");
    } else { fill("Total budget", "18"); fill("Maximum ticket price", "1"); }
    fill("Offer ends", "2099-09-15T12:00");
    await new Promise(resolve => setTimeout(resolve, 0));
    button("Review terms").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("85% coverage"));
    expect(add).not.toHaveBeenCalled();
    button("Create reward").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Send code"));
    expect(add).toHaveBeenCalledTimes(1); expect(open).toHaveBeenCalledTimes(1);
    fill("Email for your wallet", "fixture@example.invalid"); await new Promise(resolve => setTimeout(resolve, 0)); button("Send code").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Review transfer"));
    fill("Code", "123456"); await new Promise(resolve => setTimeout(resolve, 0)); button("Review transfer").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Confirm transfer"));
    expect(document.body.textContent).not.toContain("Funding confirmed");
    expect(document.body.textContent).toContain(kind === "asset_bonus" ? "10 PSTB" : "18 USDC");
    button("Confirm transfer").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Funding confirmed"));
    expect(add).toHaveBeenCalledTimes(1);
  });
});
