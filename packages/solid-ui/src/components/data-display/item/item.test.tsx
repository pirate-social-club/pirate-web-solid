import { within } from "@testing-library/dom";
import { describe, expect, it } from "vitest";

import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "./item";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("Item", () => {
  it("renders the compound row parts", () => {
    const container = render(() => (
      <Item>
        <ItemMedia variant="icon">
          <span>media</span>
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Song Title</ItemTitle>
          <ItemDescription>Artist name</ItemDescription>
        </ItemContent>
        <ItemActions>
          <span>actions</span>
        </ItemActions>
      </Item>
    ));

    expect(within(container).getByText("Song Title")).toBeVisible();
    expect(within(container).getByText("Artist name")).toBeVisible();
    expect(within(container).getByText("media")).toBeVisible();
    expect(within(container).getByText("actions")).toBeVisible();
  });

  it("applies the variant and size classes", () => {
    const container = render(() => (
      <ItemGroup>
        <Item data-testid="outline" variant="outline">
          <ItemContent>
            <ItemTitle>Outline</ItemTitle>
          </ItemContent>
        </Item>
        <Item data-testid="dense" size="dense" variant="muted">
          <ItemContent>
            <ItemTitle>Dense</ItemTitle>
          </ItemContent>
        </Item>
      </ItemGroup>
    ));

    expect(within(container).getByTestId("outline").className).toContain(
      "border-border-soft",
    );
    expect(within(container).getByTestId("outline").className).toContain("p-4");
    expect(within(container).getByTestId("dense").className).toContain("bg-muted");
    expect(within(container).getByTestId("dense").className).toContain("py-2");
  });

  it("styles media slots by variant", () => {
    const container = render(() => (
      <ItemGroup>
        <Item>
          <ItemMedia data-testid="icon" variant="icon">
            <span>icon</span>
          </ItemMedia>
          <ItemMedia data-testid="image" variant="image">
            <span>image</span>
          </ItemMedia>
        </Item>
      </ItemGroup>
    ));

    expect(within(container).getByTestId("icon").className).toContain(
      "border-border-soft",
    );
    expect(within(container).getByTestId("icon").className).toContain("size-12");
    expect(within(container).getByTestId("image").className).toContain(
      "overflow-hidden",
    );
  });

  it("clamps the description to two lines", () => {
    const container = render(() => (
      <Item>
        <ItemContent>
          <ItemTitle>Song</ItemTitle>
          <ItemDescription>Very long description text</ItemDescription>
        </ItemContent>
      </Item>
    ));

    expect(within(container).getByText("Very long description text").className).toContain(
      "line-clamp-2",
    );
  });

  it("forwards extra attributes to the root", () => {
    const container = render(() => (
      <Item id="row-1">
        <ItemContent>
          <ItemTitle>Row</ItemTitle>
        </ItemContent>
      </Item>
    ));

    expect(container.querySelector("#row-1")).not.toBeNull();
  });

  it("has no axe violations", async () => {
    render(() => (
      <ItemGroup>
        <Item>
          <ItemMedia variant="icon">
            <span>media</span>
          </ItemMedia>
          <ItemContent>
            <ItemTitle>Song Title</ItemTitle>
            <ItemDescription>Artist name</ItemDescription>
          </ItemContent>
        </Item>
      </ItemGroup>
    ));

    await expectNoA11yViolations();
  });
});
