import { render } from "@solidjs/web";
import { createRoot, createSignal } from "solid-js";
import { expect, test, vi } from "vitest";
import { GuestStudyDataControls } from "./guest-study-data-controls";
import type { GuestDataApi } from "./guest-study-data-controller";

test("owner switching remounts data controls without showing the former owner's saved preference", async () => {
  const api: GuestDataApi = {
    setLearningRetention: vi.fn<GuestDataApi["setLearningRetention"]>(async () => ({ mode: "ephemeral", effective_at: "2026-10-13T12:00:00.000Z" })),
    deleteLearnerAudio: vi.fn(),
  };
  const container = document.createElement("div");
  document.body.appendChild(container);
  let dispose = () => {};
  let switchOwner = () => {};
  createRoot((rootDispose) => {
    dispose = rootDispose;
    const [owner, setOwner] = createSignal("owner-original");
    switchOwner = () => setOwner("owner-other");
    render(() => <GuestStudyDataControls api={api} ownerId={owner()} credentialId="credential" />, container);
  });
  try {
    const button = [...container.querySelectorAll("button")].find(candidate => candidate.textContent === "Do not keep future recordings");
    expect(button).toBeDefined();
    button?.click();
    await vi.waitFor(() => expect(container.textContent).toContain("Preference saved:"));
    switchOwner();
    await vi.waitFor(() => expect(container.textContent).not.toContain("Preference saved:"));
    expect(container.textContent).toContain("Your current storage preference is not shown.");
    expect(api.setLearningRetention).toHaveBeenCalledOnce();
  } finally {
    dispose();
    container.remove();
  }
});
