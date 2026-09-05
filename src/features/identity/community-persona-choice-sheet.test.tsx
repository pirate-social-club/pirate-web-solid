import { render } from "@solidjs/web";
import { afterEach, describe, expect, test, vi } from "vitest";
import { CommunityPersonaChoiceDialog } from "./community-persona-choice-sheet";

const disposers: Array<() => void> = [];
const personas = [{
  personaId: "persona-here", displayName: "Community persona", avatarRef: null,
  primaryPublicHandle: null,
}];

function mount(open: boolean, allowCreateNew: boolean) {
  const host = document.createElement("div");
  document.body.append(host);
  const onChoose = vi.fn();
  const dispose = render(() => <CommunityPersonaChoiceDialog
    label="Singing as" personas={personas} choice={undefined}
    open={open} onOpenChange={() => {}} onChoose={onChoose}
    allowCreateNew={allowCreateNew}
  />, host);
  disposers.push(() => { dispose(); host.remove(); });
  return onChoose;
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
});

describe("community persona choice dialog", () => {
  test("does not mount a dialog before an explicit choice is needed", () => {
    mount(false, true);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  test("operation-only selection cannot offer creation", async () => {
    mount(true, false);
    await vi.waitFor(() => expect(document.body.textContent).toContain("Community persona"));
    expect(document.body.textContent).not.toContain("Create a new persona");
  });

  test("membership selection retains the explicit create-new alternative", async () => {
    mount(true, true);
    await vi.waitFor(() => expect(document.body.textContent).toContain("Create a new persona"));
  });
});
