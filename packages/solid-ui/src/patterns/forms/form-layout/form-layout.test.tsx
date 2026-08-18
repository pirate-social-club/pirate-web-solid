import { within } from "@testing-library/dom";
import { describe, expect, it } from "vitest";

import {
  FormFieldLabel,
  FormNote,
  FormSectionHeading,
} from "./form-layout";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("FormLayout", () => {
  it("renders a field label with a required marker and counter", () => {
    const container = render(() => (
      <FormFieldLabel
        htmlFor="name"
        label="Display name"
        required
        counter="12 / 30"
      />
    ));

    const view = within(container);
    expect(view.getByText("Display name")).toBeInTheDocument();
    expect(view.getByText("12 / 30")).toBeInTheDocument();
    expect(view.getByText("*")).toBeInTheDocument();
  });

  it("associates the label with its field", () => {
    const container = render(() => (
      <FormFieldLabel htmlFor="name" label="Display name" />
    ));

    expect(container.querySelector("label")).toHaveAttribute("for", "name");
  });

  it("renders a section heading with a description", () => {
    const container = render(() => (
      <FormSectionHeading
        title="Profile"
        description="Shown on your public page."
      />
    ));

    const view = within(container);
    expect(view.getByRole("heading", { name: "Profile" })).toBeInTheDocument();
    expect(view.getByText("Shown on your public page.")).toBeInTheDocument();
  });

  it("renders a note in each tone", () => {
    const container = render(() => (
      <>
        <FormNote tone="muted">Muted note</FormNote>
        <FormNote tone="destructive">Destructive note</FormNote>
        <FormNote tone="warning">Warning note</FormNote>
      </>
    ));

    const view = within(container);
    expect(view.getByText("Muted note")).toBeInTheDocument();
    expect(view.getByText("Destructive note")).toBeInTheDocument();
    expect(view.getByText("Warning note")).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    render(() => (
      <>
        <FormSectionHeading title="Profile" description="Optional." />
        <FormFieldLabel htmlFor="name" label="Display name" required />
      </>
    ));

    await expectNoA11yViolations();
  });
});
