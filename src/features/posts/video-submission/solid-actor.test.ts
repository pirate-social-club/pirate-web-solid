import { createEffect, createRoot, createSignal, flush } from "solid-js";
import { createActor, createMachine } from "xstate";
import { describe, expect, test } from "vitest";
import { useOwnedActor } from "./solid-actor";

describe("Solid 2 actor bridge", () => {
  test("an effect can send without a synchronous subscription write", async () => {
    const machine = createMachine({
      initial: "idle",
      states: { idle: { on: { START: "ready" } }, ready: {} },
    });
    let dispose = () => {};
    let fire = () => {};
    let current = "";
    createRoot(release => {
      dispose = release;
      const actor = createActor(machine);
      const { snapshot, send } = useOwnedActor(actor);
      const [trigger, setTrigger] = createSignal(false);
      createEffect(() => trigger(), value => { if (value) send({ type: "START" }); });
      createEffect(() => snapshot().value, value => { current = String(value); });
      fire = () => setTrigger(true);
    });
    fire();
    flush();
    await Promise.resolve();
    flush();
    expect(current).toBe("ready");
    dispose();
  });

  test("disposal drops queued sends and stops the owned actor", async () => {
    const machine = createMachine({ initial: "idle", states: { idle: { on: { START: "ready" } }, ready: {} } });
    let dispose = () => {};
    let send = (_event: { type: "START" }) => {};
    let actor = createActor(machine);
    createRoot(release => {
      dispose = release;
      actor = createActor(machine);
      send = useOwnedActor(actor).send;
    });
    send({ type: "START" });
    dispose();
    await Promise.resolve();
    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().status).toBe("stopped");
  });
});
