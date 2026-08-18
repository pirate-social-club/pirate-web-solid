import { within } from "@testing-library/dom";
import { createSignal, flush } from "solid-js";
import { describe, expect, it } from "vitest";

import {
  Avatar,
  buildRetriedImageSrc,
  isRenderableImageSrc,
  isRetryableImageSrc,
} from "./avatar";
import { IconMusicNote } from "@/components/media/icons";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("avatar image helpers", () => {
  it("marks renderable image urls", () => {
    expect(isRenderableImageSrc("https://pirate.test/avatar/avatar_1.png")).toBe(true);
    expect(isRenderableImageSrc("/avatar/avatar_1.png")).toBe(true);
    expect(isRenderableImageSrc("data:image/svg+xml;base64,abc")).toBe(true);
    expect(isRenderableImageSrc("blob:http://localhost/avatar")).toBe(true);
    expect(isRenderableImageSrc("avatar.png")).toBe(true);
    expect(isRenderableImageSrc("ipfs://seed-avatar")).toBe(false);
    expect(isRenderableImageSrc("")).toBe(false);
  });

  it("skips data uris for retry", () => {
    expect(isRetryableImageSrc("https://pirate.test/avatar/avatar_1.png")).toBe(true);
    expect(isRetryableImageSrc("/avatar/avatar_1.png")).toBe(true);
    expect(isRetryableImageSrc("data:image/svg+xml;base64,abc")).toBe(false);
    expect(isRetryableImageSrc("")).toBe(false);
  });

  it("appends a cache-busting retry parameter", () => {
    const retried = buildRetriedImageSrc("https://pirate.test/avatar/avatar_1.png");
    const retriedUrl = new URL(retried);

    expect(retriedUrl.pathname).toBe("/avatar/avatar_1.png");
    expect(retriedUrl.searchParams.has("_img_retry")).toBe(true);
  });
});

describe("Avatar", () => {
  it("renders initials with an accessible name when no src is provided", () => {
    const container = render(() => <Avatar fallback="Jane Doe" />);

    const avatar = within(container).getByRole("img", { name: "Jane Doe" });
    expect(avatar).toBeVisible();
    expect(within(container).getByText("JD")).toBeVisible();
  });

  it("renders the image with the fallback text as its alt", () => {
    const container = render(() => (
      <Avatar fallback="Jane Doe" src="https://pirate.test/avatar/avatar_1.png" />
    ));

    const image = within(container).getByAltText("Jane Doe");
    expect(image).toHaveAttribute("src", "https://pirate.test/avatar/avatar_1.png");
  });

  it("retries the primary image once, then falls back to the alternate src", () => {
    const container = render(() => (
      <Avatar
        fallback="Jane Doe"
        fallbackSrc="https://pirate.test/avatar/backup_1.png"
        src="https://pirate.test/avatar/avatar_1.png"
      />
    ));

    const image = within(container).getByAltText("Jane Doe");

    image.dispatchEvent(new Event("error"));
    flush();
    expect(image).toHaveAttribute("src", expect.stringContaining("_img_retry="));

    image.dispatchEvent(new Event("error"));
    flush();
    expect(image).toHaveAttribute("src", "https://pirate.test/avatar/backup_1.png");
  });

  it("shows a skeleton when the image fails and no fallback text remains", () => {
    const container = render(() => (
      <Avatar fallback="" src="https://pirate.test/avatar/avatar_1.png" />
    ));

    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    image!.dispatchEvent(new Event("error"));
    flush();
    image!.dispatchEvent(new Event("error"));
    flush();

    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(container.querySelector("[class*='animate-pulse']")).toBeInTheDocument();
  });

  it("replaces the image when src changes after a successful render", () => {
    const [src, setSrc] = createSignal("https://pirate.test/avatar/avatar_1.png");
    const container = render(() => <Avatar fallback="Jane Doe" src={src()} />);

    const image = within(container).getByAltText("Jane Doe");
    expect(image).toHaveAttribute("src", "https://pirate.test/avatar/avatar_1.png");

    setSrc("https://pirate.test/avatar/avatar_2.png");
    flush();

    expect(image).toHaveAttribute("src", "https://pirate.test/avatar/avatar_2.png");
  });

  it("recovers from a failed image when src changes", () => {
    const [src, setSrc] = createSignal("https://pirate.test/avatar/avatar_1.png");
    const container = render(() => <Avatar fallback="Jane Doe" src={src()} />);

    const image = within(container).getByAltText("Jane Doe");
    image.dispatchEvent(new Event("error"));
    flush();
    image.dispatchEvent(new Event("error"));
    flush();
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(within(container).getByText("JD")).toBeVisible();

    setSrc("https://pirate.test/avatar/avatar_2.png");
    flush();

    expect(within(container).getByAltText("Jane Doe")).toHaveAttribute(
      "src",
      "https://pirate.test/avatar/avatar_2.png",
    );
    expect(within(container).queryByText("JD")).not.toBeInTheDocument();
  });

  it("resets the retry chain when fallbackSrc changes after failure", () => {
    const [fallbackSrc, setFallbackSrc] = createSignal("https://pirate.test/avatar/backup_1.png");
    const container = render(() => (
      <Avatar
        fallback="Jane Doe"
        fallbackSrc={fallbackSrc()}
        src="https://pirate.test/avatar/avatar_1.png"
      />
    ));

    const image = within(container).getByAltText("Jane Doe");
    image.dispatchEvent(new Event("error"));
    flush();
    expect(image).toHaveAttribute("src", expect.stringContaining("_img_retry="));

    setFallbackSrc("https://pirate.test/avatar/backup_2.png");
    flush();

    image.dispatchEvent(new Event("error"));
    flush();
    expect(image).toHaveAttribute("src", "https://pirate.test/avatar/backup_2.png");
  });

  it("renders a fallback icon instead of initials", () => {
    const container = render(() => (
      <Avatar fallback="Music" fallbackIcon={<IconMusicNote class="size-5" />} />
    ));

    expect(within(container).getByRole("img", { name: "Music" })).toBeVisible();
    expect(within(container).queryByText("M")).not.toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    render(() => (
      <div>
        <Avatar fallback="Jane Doe" />
        <Avatar fallback="Jane Doe" src="https://pirate.test/avatar/avatar_1.png" />
      </div>
    ));

    await expectNoA11yViolations();
  });
});
