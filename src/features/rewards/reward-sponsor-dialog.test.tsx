import { ApplicationSessionProvider, type ApplicationSessionState } from "../shell/application-session.tsx";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@solidjs/web";
import { createRoot, createSignal } from "solid-js";
import { RewardSponsorDialog } from "./reward-sponsor-dialog.tsx";
import { rewardSponsorFixture } from "./reward-sponsor.fixture.ts";
const disposers: Array<() => void> = [];
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); document.body.replaceChildren(); });
function button(text: string) {
  const found = Array.from(document.querySelectorAll("button")).find(element => element.textContent === text);
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}
function fill(label: string, value: string) {
  const labelElement = Array.from(document.querySelectorAll("label")).find(element => element.textContent?.startsWith(label));
  const input = labelElement?.querySelector("input") ?? document.getElementById(labelElement?.htmlFor ?? "");
  if (!(input instanceof HTMLInputElement)) throw new Error(`Missing input: ${label}`);
  input.value = value; input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true }));
}
describe("composed sponsor journey", () => {
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
      const reward = Array.from(document.querySelectorAll("select"))[1];
      reward.value = "asset_bonus"; reward.dispatchEvent(new Event("change", { bubbles: true }));
      await vi.waitFor(() => expect(document.body.textContent).toContain("Amount per person"));
      fill("Amount per person", "1"); fill("Number of recipients", "10");
      expect(document.body.textContent).not.toContain("Additional score floor");
    } else { fill("Budget", "18"); fill("Maximum ticket price", "1"); }
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
