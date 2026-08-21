/** @jsxImportSource @solidjs/web */
import { afterEach, describe, expect, test } from "vitest";
import { render as solidRender } from "@solidjs/web";
import { createRoot, createSignal } from "solid-js";
import type { JSX } from "@solidjs/web";

import { buildCreatePostRequest } from "./create-post-dialog";
import { CreatePostDialog } from "./create-post-dialog";
import { createMemoryPendingSubmissionStorage, createPendingSubmissionEnvelope } from "./pending-submission";

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
  document.body.replaceChildren();
});

describe("create post request", () => {
  test("builds the community-scoped text post contract", () => {
    expect(buildCreatePostRequest({
      communityId: "  community-1 ",
      title: "  Hello Pirate ",
      body: "  A first post from the Solid shell. ",
      idempotencyKey: "idem-1",
    })).toEqual({
      path: { communityId: "community-1" },
      body: {
        idempotency_key: "idem-1",
        post_type: "text",
        authorship_mode: "human_direct",
        identity_mode: "public",
        visibility: "public",
        title: "Hello Pirate",
        body: "A first post from the Solid shell.",
      },
    });
  });

  test("keeps a pending envelope across dialog close and reopen", async () => {
    const storage = createMemoryPendingSubmissionStorage();
    await storage.save(await createPendingSubmissionEnvelope({
      request: buildCreatePostRequest({ communityId: "community-1", title: "", body: "A durable draft", idempotencyKey: "pending-1" }),
      pendingRequestId: "pending-1",
      createdAt: "2026-08-21T00:00:00Z",
    }));
    const transport = {
      read: async () => null,
      dispatch: async () => { throw new Error("network uncertain"); },
    };
    const [open, setOpen] = createSignal(true);
    render(() => <CreatePostDialog
      open={open()}
      onOpenChange={setOpen}
      storage={storage}
      transport={transport}
    />);
    expect((await storage.loadAll()).length).toBe(1);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    setOpen(false);
    setOpen(true);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect((await storage.loadAll()).length).toBe(1);
    expect(document.body.textContent).toContain("Checking whether your post was accepted");
  });
});
