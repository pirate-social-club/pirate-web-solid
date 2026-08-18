import { screen, within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { expectNoA11yViolations, render } from "@/test/test-utils";

import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "./modal";

function renderModal(forceMobile?: boolean) {
  return render(() => (
    <Modal forceMobile={forceMobile} open>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Unlock this content</ModalTitle>
          <ModalDescription>Add funds to continue.</ModalDescription>
        </ModalHeader>
        <ModalFooter>
          <button type="button">Add funds</button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  ));
}

describe("Modal", () => {
  it("renders a named dialog on the desktop branch", async () => {
    renderModal(false);

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Unlock this content" }),
    ).toBeVisible();
    expect(within(dialog).getByText("Add funds to continue.")).toBeVisible();
  });

  it("renders the mobile sheet branch when forced", async () => {
    renderModal(true);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeVisible();
    // Sheet branch: the bottom-side variant anchors the surface to the bottom.
    expect(document.querySelector('[class*="bottom-0"]')).not.toBeNull();
  });

  it("supports typed title and description typography", async () => {
    render(() => (
      <Modal forceMobile={false} open>
        <ModalContent>
          <ModalHeader>
            <ModalTitle leading="tight" variant="h1">
              Unlock this song
            </ModalTitle>
            <ModalDescription leading="roomy" variant="body">
              Buy full access to this song.
            </ModalDescription>
          </ModalHeader>
        </ModalContent>
      </Modal>
    ));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Unlock this song" })).toHaveClass(
      "text-3xl",
      "leading-tight",
    );
    expect(within(dialog).getByText("Buy full access to this song.")).toHaveClass(
      "text-base",
      "leading-8",
    );
  });

  it("forwards direction to the portaled desktop content", async () => {
    render(() => (
      <Modal forceMobile={false} open>
        <ModalContent dir="rtl">
          <ModalTitle>RTL content</ModalTitle>
        </ModalContent>
      </Modal>
    ));

    expect(await screen.findByRole("dialog")).toHaveAttribute("dir", "rtl");
  });

  it("forwards direction to the portaled mobile content", async () => {
    render(() => (
      <Modal forceMobile open>
        <ModalContent dir="rtl">
          <ModalTitle>RTL sheet</ModalTitle>
        </ModalContent>
      </Modal>
    ));

    expect(await screen.findByRole("dialog")).toHaveAttribute("dir", "rtl");
  });

  it("closes on Escape and reports through onOpenChange", async () => {
    const user = userEvent.setup();
    let openState = true;
    render(() => (
      <Modal forceMobile={false} onOpenChange={(open) => (openState = open)} open>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Closable</ModalTitle>
          </ModalHeader>
        </ModalContent>
      </Modal>
    ));

    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    expect(openState).toBe(false);
  });

  it("has no automated a11y violations", async () => {
    renderModal(false);
    await screen.findByRole("dialog");

    await expectNoA11yViolations();
  });
});
