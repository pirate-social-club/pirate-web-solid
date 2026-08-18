import { userEvent } from "@testing-library/user-event";
import { screen, within } from "@testing-library/dom";
import { describe, expect, it } from "vitest";

import {
  TextField,
  TextFieldDescription,
  TextFieldErrorMessage,
  TextFieldInput,
  TextFieldLabel,
} from "./text-field";
import { expectNoA11yViolations, render } from "@/test/test-utils";

function renderTextField(props: { defaultValue?: string; disabled?: boolean; validationState?: "valid" | "invalid" } = {}) {
  return render(() => (
    <TextField {...props} name="display-name">
      <TextFieldLabel>Display name</TextFieldLabel>
      <TextFieldInput />
      <TextFieldDescription>Shown on your public profile.</TextFieldDescription>
      <TextFieldErrorMessage>Display name is required.</TextFieldErrorMessage>
    </TextField>
  ));
}

describe("TextField", () => {
  it("associates the label with the input", () => {
    renderTextField();

    const input = screen.getByRole("textbox", { name: "Display name" });
    expect(input).toHaveAttribute("name", "display-name");
  });

  it("supports typing", async () => {
    const user = userEvent.setup();
    const container = renderTextField();

    const input = within(container).getByRole("textbox", { name: "Display name" });
    await user.type(input, "Example user");
    expect(input).toHaveValue("Example user");
  });

  it("wires the description through the field API", () => {
    const container = renderTextField({ defaultValue: "Example user" });

    const input = within(container).getByRole("textbox", { name: "Display name" });
    expect(input).toHaveAccessibleDescription("Shown on your public profile.");
    expect(
      within(container).queryByText("Display name is required."),
    ).not.toBeInTheDocument();
  });

  it("wires the error message into the description when the field is invalid", () => {
    const container = renderTextField({ validationState: "invalid" });

    const input = within(container).getByRole("textbox", { name: "Display name" });
    expect(input).toHaveAccessibleDescription(
      "Shown on your public profile. Display name is required.",
    );
  });

  it("marks the field invalid and required when configured", () => {
    const container = renderTextField({ validationState: "invalid" });

    const input = within(container).getByRole("textbox", { name: "Display name" });
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("supports the disabled state", () => {
    renderTextField({ disabled: true });

    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("has no axe violations", async () => {
    renderTextField({ defaultValue: "Example user" });

    await expectNoA11yViolations();
  });
});
