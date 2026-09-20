/** @jsxImportSource @solidjs/web */
import { render } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SongAttributionChip } from "./song-attribution-chip";

const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
});

const attribution = { songPostId: "song-post-id", title: "A projected song", songAuthorPersonaId: "persona-id" };

function mount(props: {
  readonly resolveLink?: (value: typeof attribution) => Promise<{ href: string; authorName: string | null } | null>;
  readonly navigate?: (href: string) => void;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  createRoot(dispose => {
    disposers.push(dispose);
    render(() => <SongAttributionChip attribution={attribution} resolveLink={props.resolveLink} navigate={props.navigate} />, container);
  });
  return container;
}

describe("the song attribution chip", () => {
  test("links the video back to its song once the route resolves", async () => {
    const container = mount({ resolveLink: async () => ({ href: "/posts/a-song", authorName: "The author" }) });
    await vi.waitFor(() => expect(container.querySelector("a")).not.toBeNull());
    const chip = container.querySelector("a")!;
    expect(chip.getAttribute("href")).toBe("/posts/a-song");
    expect(chip.textContent).toContain("A projected song");
    expect(chip.textContent).toContain("The author");
    expect(chip.getAttribute("data-song-chip")).toBe("song-post-id");
  });

  test("shows the song as honest text when no link can be resolved", async () => {
    const container = mount({ resolveLink: async () => null });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("[data-song-chip]")?.textContent).toContain("A projected song");
  });

  test("routes through the host's navigate when one is given", async () => {
    const navigate = vi.fn();
    const container = mount({ resolveLink: async () => ({ href: "/posts/a-song", authorName: null }), navigate });
    await vi.waitFor(() => expect(container.querySelector("a")).not.toBeNull());
    container.querySelector("a")!.click();
    expect(navigate).toHaveBeenCalledWith("/posts/a-song");
  });
});
