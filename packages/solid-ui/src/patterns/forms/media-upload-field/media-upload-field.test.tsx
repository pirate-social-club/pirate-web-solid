import { within } from "@testing-library/dom";
import { describe, expect, it } from "vitest";

import { MediaUploadField } from "./media-upload-field";
import { expectNoA11yViolations, render } from "@/test/test-utils";

const pngPixel =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

describe("MediaUploadField", () => {
  it("exposes the file input by its label", () => {
    const container = render(() => <MediaUploadField label="Cover image" />);
    expect(within(container).getByLabelText("Cover image")).toHaveAttribute("type", "file");
  });

  // Two fields on one page must not share an input id.
  it("generates a distinct input id per instance", () => {
    const container = render(() => (
      <>
        <MediaUploadField label="Cover image" />
        <MediaUploadField label="Community avatar" frame="circle" />
      </>
    ));
    const view = within(container);
    const cover = view.getByLabelText("Cover image");
    const avatar = view.getByLabelText("Community avatar");
    expect(cover.id).not.toBe(avatar.id);
    expect(cover.id).not.toBe("");
  });

  it("swaps the trigger copy once a preview exists", () => {
    const empty = render(() => (
      <MediaUploadField chooseLabel="Add cover" label="Cover image" replaceLabel="Replace cover" />
    ));
    expect(within(empty).getByText("Add cover")).toBeInTheDocument();

    const filled = render(() => (
      <MediaUploadField
        chooseLabel="Choose image"
        label="Community avatar"
        previewSrc={pngPixel}
        replaceLabel="Replace image"
        frame="circle"
      />
    ));
    expect(within(filled).getByText("Replace image")).toBeInTheDocument();
  });

  it("offers a clear control only when there is something to clear", () => {
    const empty = render(() => <MediaUploadField label="Cover image" onClear={() => undefined} />);
    expect(within(empty).queryByRole("button", { name: "Remove Cover image" })).toBeNull();

    const filled = render(() => (
      <MediaUploadField label="Cover image" onClear={() => undefined} previewSrc={pngPixel} />
    ));
    expect(within(filled).getByRole("button", { name: "Remove Cover image" })).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    render(() => (
      <MediaUploadField description="Wide artwork works best." label="Cover image" />
    ));
    await expectNoA11yViolations();
  });
});
