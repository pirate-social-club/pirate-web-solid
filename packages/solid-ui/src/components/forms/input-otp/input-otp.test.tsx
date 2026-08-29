import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { expectNoA11yViolations, render } from "@/test/test-utils";
import { InputOTP } from "./input-otp";

describe("InputOTP", () => {
  it("renders the requested number of accessible cells", () => {
    const container = render(() => <InputOTP aria-label="Verification code" />);

    expect(container.querySelectorAll("input")).toHaveLength(6);
    expect(container.querySelector('input[aria-label="Verification code digit 1 of 6"]')).toBeInTheDocument();
  });

  it("advances through cells while keeping one controlled value", async () => {
    const user = userEvent.setup();
    let value = "";
    const container = render(() => (
      <InputOTP aria-label="Verification code" onChange={(next) => { value = next; }} value={value} />
    ));
    const inputs = container.querySelectorAll("input");

    await user.type(inputs[0], "4");
    expect(value).toBe("4");
    expect(document.activeElement).toBe(inputs[1]);
  });

  it("distributes a pasted code from the focused cell", async () => {
    const user = userEvent.setup();
    let value = "";
    const container = render(() => (
      <InputOTP aria-label="Verification code" onChange={(next) => { value = next; }} value={value} />
    ));
    const inputs = container.querySelectorAll("input");

    await user.click(inputs[0]);
    await user.paste("48 12ab");
    expect(value).toBe("4812");
  });

  it("supports a custom length and disabled state", () => {
    const container = render(() => <InputOTP aria-label="Short code" disabled length={4} />);

    expect(container.querySelectorAll("input")).toHaveLength(4);
    expect(Array.from(container.querySelectorAll("input")).every((input) => input.disabled)).toBe(true);
  });

  it("has no axe violations", async () => {
    render(() => <InputOTP aria-label="Verification code" />);
    await expectNoA11yViolations();
  });
});
