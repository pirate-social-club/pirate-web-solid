import { createRewardFundingController } from "../../src/api/reward-funding-controller.ts";
import { createBrowserRewardFundingRecovery } from "../../src/api/reward-funding-recovery.ts";
import { actor, context, fee, target, transactionHash } from "./reward-funding.ts";

function fixtureController() {
  return createRewardFundingController({ actor, target, currentActor: () => actor,
    recovery: createBrowserRewardFundingRecovery(),
    api: {
      load: async () => context(),
      observe: async () => {
        if (localStorage.getItem("fixture:offline") === "yes") throw new Error("fixture offline");
        return { ...context().funding, status: "confirming", transaction_hash: transactionHash };
      },
    },
    wallet: {
      estimate: async () => fee, dispose: () => {},
      send: async (_context, _fee, before) => {
        await before();
        localStorage.setItem("fixture:sends", String(Number(localStorage.getItem("fixture:sends") ?? "0") + 1));
        await new Promise(resolve => setTimeout(resolve, 100));
        if (localStorage.getItem("fixture:lost") === "yes") throw new Error("fixture response lost");
        return transactionHash;
      },
    },
  });
}
const controller = fixtureController();
async function prepare() {
  const state = await controller.prepare();
  if (state.kind !== "review") throw new Error("fixture expected review");
  return state.review.id;
}
function reset() {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("fixture:") || key.startsWith("pirate:reward-funding:")) localStorage.removeItem(key);
  }
}
const fixture = {
  prepare, confirm: controller.confirm, recover: controller.recover, reset,
  async race() {
    reset();
    const frame = document.createElement("iframe");
    const loaded = new Promise<void>(resolve => { frame.onload = () => resolve(); });
    frame.src = location.href; document.body.append(frame); await loaded;
    const sibling = frame.contentWindow?.rewardFixture;
    if (sibling === undefined) throw new Error("fixture child unavailable");
    const [one, two] = await Promise.all([prepare(), sibling.prepare()]);
    const states = await Promise.all([controller.confirm(one), sibling.confirm(two)]);
    frame.remove();
    return { sends: Number(localStorage.getItem("fixture:sends")), states: states.map(state => state.kind), locks: navigator.locks !== undefined };
  },
};
declare global { interface Window { rewardFixture: typeof fixture } }
window.rewardFixture = fixture;
document.querySelector("button")?.addEventListener("click", async () => {
  const output = document.querySelector("pre");
  if (output !== null) output.textContent = JSON.stringify(await fixture.race());
});
