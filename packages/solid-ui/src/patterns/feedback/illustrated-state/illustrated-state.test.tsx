import { within } from "@testing-library/dom";
import { describe, expect, it } from "vitest";

import { IllustratedState } from "./illustrated-state";
import { expectNoA11yViolations, render } from "@/test/test-utils";

const image = {
  alt: "Confused pirate ghost",
  src: "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
  srcSet: "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E 1x",
};

describe("IllustratedState", () => {
  it("renders the image, title and description", () => {
    const container = render(() => (
      <IllustratedState
        description="Something went wrong."
        image={image}
        title="Could not load"
      />
    ));

    const img = within(container).getByRole("img", { name: "Confused pirate ghost" });
    expect(img).toHaveAttribute("src", image.src);
    expect(within(container).getByText("Could not load")).toBeVisible();
    expect(within(container).getByText("Something went wrong.")).toBeVisible();
  });

  it("renders the webp source before the fallback image", () => {
    const container = render(() => (
      <IllustratedState description="Copy" image={image} title="State" />
    ));

    const source = container.querySelector("picture source");
    expect(source).toHaveAttribute("srcset", image.srcSet);
    expect(source).toHaveAttribute("type", "image/webp");
  });

  it("renders an optional action", () => {
    const container = render(() => (
      <IllustratedState
        action={<button type="button">Try again</button>}
        description="Refresh and retry."
        image={image}
        title="Request failed"
      />
    ));

    expect(within(container).getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("omits optional title and description blocks", () => {
    const container = render(() => <IllustratedState image={image} />);

    expect(container.querySelectorAll("p").length).toBe(0);
    expect(container.querySelector("picture")).not.toBeNull();
  });

  it("has no axe violations", async () => {
    render(() => (
      <IllustratedState
        action={<button type="button">Try again</button>}
        description="Refresh and retry."
        image={image}
        title="Request failed"
      />
    ));

    await expectNoA11yViolations();
  });
});
