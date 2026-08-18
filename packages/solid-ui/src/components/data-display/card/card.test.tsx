import { screen, within } from "@testing-library/dom";
import { describe, expect, it } from "vitest";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("Card", () => {
  it("renders the compound parts with a heading title", () => {
    const container = render(() => (
      <Card>
        <CardHeader>
          <CardTitle>Community</CardTitle>
          <CardDescription>Description copy.</CardDescription>
        </CardHeader>
        <CardContent>Body content.</CardContent>
        <CardFooter>Footer content.</CardFooter>
      </Card>
    ));

    expect(within(container).getByRole("heading", { name: "Community" })).toBeVisible();
    expect(within(container).getByText("Description copy.")).toBeVisible();
    expect(within(container).getByText("Body content.")).toBeVisible();
    expect(within(container).getByText("Footer content.")).toBeVisible();
  });

  it("has no axe violations", async () => {
    render(() => (
      <Card>
        <CardHeader>
          <CardTitle>Community</CardTitle>
          <CardDescription>Description copy.</CardDescription>
        </CardHeader>
        <CardContent>Body content.</CardContent>
      </Card>
    ));

    await expectNoA11yViolations();
  });
});
