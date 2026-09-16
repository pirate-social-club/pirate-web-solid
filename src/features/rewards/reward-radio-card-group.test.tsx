import { render } from "@solidjs/web";
import { createRoot, createSignal } from "solid-js";
import { afterEach, expect, it, vi } from "vitest";
import { RewardRadioCardGroup } from "./reward-radio-card-group.tsx";

const disposers: Array<() => void> = [];
afterEach(() => {
  disposers.splice(0).forEach(dispose => dispose());
  document.body.replaceChildren();
});

it("moves selection and focus with arrow keys, wraps, and keeps one tab stop", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  createRoot(dispose => {
    disposers.push(dispose);
    const [value, setValue] = createSignal<"bonus" | "pool">("bonus");
    render(() => <RewardRadioCardGroup label="Reward type" labels={{ bonus: "Token bonus", pool: "Megapot ticket" }} options={["bonus", "pool"]} value={value()} onChange={setValue} />, host);
  });
  const radios = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
  expect(radios.map(radio => radio.tabIndex)).toEqual([0, -1]);
  radios[0].focus();
  radios[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  await vi.waitFor(() => expect(radios.map(radio => radio.getAttribute("aria-checked"))).toEqual(["false", "true"]));
  expect(document.activeElement).toBe(radios[1]);
  expect(radios.map(radio => radio.tabIndex)).toEqual([-1, 0]);
  radios[1].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  await vi.waitFor(() => expect(radios[0].getAttribute("aria-checked")).toBe("true"));
  expect(document.activeElement).toBe(radios[0]);
  radios[1].click();
  await vi.waitFor(() => expect(radios[1].getAttribute("aria-checked")).toBe("true"));
  expect(host.querySelector('[role="radiogroup"]')?.getAttribute("aria-labelledby")).toBe(host.querySelector("span[id]")?.id);
});
