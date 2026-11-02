import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot, createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";
import { CommunityTelegramSettingsController } from "./community-telegram-settings-controller";
import type { CommunityTelegramSettingsApi } from "./community-telegram-settings-api";
import { TELEGRAM_CONNECTED, TELEGRAM_DISCONNECTED } from "./community-telegram-fixtures";
import { createCommunityTelegramSettingsApi } from "./community-telegram-settings-api";
import type { CommunityTelegramSettings } from "./community-telegram-model";

const disposers: Array<() => void> = [];
function render(ui: () => JSX.Element) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let dispose = () => {};
  createRoot((cleanup) => {
    dispose = cleanup;
    disposers.push(cleanup);
    solidRender(ui, container);
  });
  return { container, dispose };
}
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
});
function api(overrides: Partial<CommunityTelegramSettingsApi> = {}): CommunityTelegramSettingsApi {
  const unexpected = async (): Promise<never> => { throw new Error("Unexpected write"); };
  return {
    getSettings: async ({ communityId }) => ({ ...TELEGRAM_DISCONNECTED, community_id: communityId }),
    getDeliveries: async () => ({ items: [], next_cursor: null }),
    getStudyCatalogue: async () => ({ availability: "unavailable", items: [], next_cursor: null }),
    saveStudy: unexpected,
    getModels: async () => ({ items: [] }), getVoices: async () => ({ items: [] }),
    connect: unexpected, disconnect: unexpected, save: unexpected, saveCredential: unexpected,
    startSetup: unexpected, getSetup: unexpected, confirmSetup: unexpected, backfill: unexpected, resolve: unexpected,
    ...overrides,
  };
}

test.each(["telegram", "assistant"] as const)("mounts the %s settings controller under Solid 2", async (section) => {
  const getSettings = vi.fn<CommunityTelegramSettingsApi["getSettings"]>(async ({ communityId }) => ({
    ...TELEGRAM_DISCONNECTED, community_id: communityId,
  }));
  const { container } = render(() => <CommunityTelegramSettingsController communityId="community-fixture" section={section} api={api({ getSettings })} />);
  await vi.waitFor(() => expect(container.querySelector(section === "telegram" ? "#telegram-bot-token" : "#assistant-model")).not.toBeNull());
  expect(getSettings).toHaveBeenCalledTimes(1);
});

test("does not install an old community's settings after switching communities", async () => {
  let resolveOld!: (settings: CommunityTelegramSettings) => void;
  const getSettings = vi.fn<CommunityTelegramSettingsApi["getSettings"]>(({ communityId }) => communityId === "old-community"
    ? new Promise((resolve) => { resolveOld = resolve; })
    : Promise.resolve({ ...TELEGRAM_DISCONNECTED, community_id: communityId, bot_username: "current_bot" }));
  const [communityId, setCommunityId] = createSignal("old-community");
  const { container } = render(() => <CommunityTelegramSettingsController communityId={communityId()} section="telegram" api={api({ getSettings })} />);
  await vi.waitFor(() => expect(getSettings).toHaveBeenCalledTimes(1));
  setCommunityId("current-community");
  await vi.waitFor(() => expect(container.textContent).toContain("@current_bot"));
  resolveOld({ ...TELEGRAM_DISCONNECTED, community_id: "old-community", bot_username: "obsolete_bot" });
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  expect(container.textContent).toContain("@current_bot");
  expect(container.textContent).not.toContain("@obsolete_bot");
});

test("does not load settings after disposal before the queued reset", async () => {
  const getSettings = vi.fn<CommunityTelegramSettingsApi["getSettings"]>(async () => TELEGRAM_DISCONNECTED);
  const { dispose } = render(() => <CommunityTelegramSettingsController communityId="community-fixture" section="telegram" api={api({ getSettings })} />);
  dispose();
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  expect(getSettings).not.toHaveBeenCalled();
});

test("skips a queued reset for a community that is no longer selected", async () => {
  const getSettings = vi.fn<CommunityTelegramSettingsApi["getSettings"]>(async ({ communityId }) => ({
    ...TELEGRAM_DISCONNECTED, community_id: communityId, bot_username: "current_bot",
  }));
  const [communityId, setCommunityId] = createSignal("obsolete-community");
  const { container } = render(() => <CommunityTelegramSettingsController communityId={communityId()} section="telegram" api={api({ getSettings })} />);
  setCommunityId("current-community");
  await vi.waitFor(() => expect(container.textContent).toContain("@current_bot"));
  expect(getSettings).toHaveBeenCalledTimes(1);
  expect(getSettings).toHaveBeenCalledWith({ communityId: "current-community" });
});

test("connect clears the masked token immediately and only opens a ready bot", async () => {
  let resolveConnect!: (settings: CommunityTelegramSettings) => void;
  const connect = vi.fn<CommunityTelegramSettingsApi["connect"]>(()=>new Promise(resolve=>{resolveConnect=resolve;}));
  const {container}=render(()=><CommunityTelegramSettingsController communityId="community-fixture" section="telegram" api={api({connect})}/>);
  await vi.waitFor(()=>expect(container.querySelector<HTMLInputElement>("#telegram-bot-token")).not.toBeNull());
  const input=container.querySelector<HTMLInputElement>("#telegram-bot-token")!;
  expect(input.type).toBe("password");
  expect(container.querySelector<HTMLAnchorElement>('a[href="https://t.me/BotFather"]')).not.toBeNull();
  expect(container.querySelector("details")?.open).toBe(false);
  input.value="fixture-token";
  input.dispatchEvent(new Event("input",{bubbles:true}));
  const connectButton=Array.from(container.querySelectorAll("button")).find(button=>button.textContent === "Connect bot")!;
  await vi.waitFor(()=>expect(connectButton.disabled).toBe(false));
  connectButton.click();
  await vi.waitFor(()=>expect(connect).toHaveBeenCalledTimes(1));
  expect(connect.mock.calls[0]?.[1]).toBe("fixture-token");
  expect(input.value).toBe("");
  expect(container.textContent).not.toContain("fixture-token");
  expect(container.querySelector('a[href="https://t.me/fixture_bot"]')).toBeNull();
  resolveConnect({...TELEGRAM_DISCONNECTED,status:"ready",bot_username:"fixture_bot",revision:1});
  await vi.waitFor(()=>expect(container.querySelector('a[href="https://t.me/fixture_bot"]')).not.toBeNull());
  expect(input.value).toBe("");
});

test("Study saves only through its owner API and waits for the saved response", async () => {
  const current={...TELEGRAM_CONNECTED,channel:null,automatic_publishing:false};
  let resolveSave!: (settings: CommunityTelegramSettings) => void;
  const saveStudy=vi.fn<CommunityTelegramSettingsApi["saveStudy"]>(()=>new Promise(resolve=>{resolveSave=resolve;}));
  const {container}=render(()=><CommunityTelegramSettingsController communityId="community-fixture" section="telegram" api={api({
    getSettings:async()=>current,
    getStudyCatalogue:async()=>({availability:"available",items:[{post_id:"song",title:"Ready song"}],next_cursor:null}),saveStudy,
  })}/>);
  await vi.waitFor(()=>expect(container.textContent).toContain("1 song is ready for practice."));
  const checkbox=container.querySelector<HTMLInputElement>('section[aria-label="Song practice"] input')!;
  expect(checkbox.disabled).toBe(false);
  checkbox.click();
  await vi.waitFor(()=>expect(saveStudy).toHaveBeenCalledTimes(1));
  expect(saveStudy.mock.calls[0]?.[0].revision).toBe(current.revision);
  expect(saveStudy.mock.calls[0]?.[1]).toBe(true);
  expect(checkbox.checked).toBe(false);
  resolveSave({...current,revision:current.revision+1,study_enabled:true});
  await vi.waitFor(()=>expect(checkbox.checked).toBe(true));
});

test("unavailable and failed catalogue reads never advertise an empty ready catalogue", async () => {
  for (const getStudyCatalogue of [
    async()=>({availability:"unavailable" as const,items:[],next_cursor:null}),
    async():Promise<never>=>{throw Error("unavailable");},
  ]) {
    const {container,dispose}=render(()=><CommunityTelegramSettingsController communityId="community-fixture" section="telegram" api={api({getSettings:async()=>TELEGRAM_CONNECTED,getStudyCatalogue})}/>);
    await vi.waitFor(()=>expect(container.querySelector<HTMLInputElement>('section[aria-label="Song practice"] input')?.disabled).toBe(true));
    expect(container.textContent).not.toContain("No songs are ready");
    dispose(); container.remove();
  }
});

test("Study writes carry same-origin cookies, CSRF, revision and replay fences",async()=>{
  const requests:Request[]=[];
  const port=createCommunityTelegramSettingsApi({origin:"https://web.test",readCsrfToken:()=>"fixture-csrf",fetchImpl:async(input,init)=>{
    requests.push(new Request(input,init));
    return new Response(JSON.stringify({...TELEGRAM_CONNECTED,study_enabled:true}),{headers:{"content-type":"application/json"}});
  }});
  await port.saveStudy(TELEGRAM_CONNECTED,true,"fixture-command");
  expect(requests[0]?.url).toBe("https://web.test/api/communities/community-fixture/telegram/study");
  expect(requests[0]?.credentials).toBe("same-origin");
  expect(requests[0]?.headers.get("x-csrf-token")).toBe("fixture-csrf");
  expect(await requests[0]!.json()).toEqual({expected_revision:4,idempotency_key:"fixture-command",enabled:true});
});
