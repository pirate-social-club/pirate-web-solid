/** @jsxImportSource @solidjs/web */
import { afterEach, describe, expect, test, vi } from "vitest";
import { render as solidRender } from "@solidjs/web";
import { createRoot, flush } from "solid-js";

import { createMemoryMediaSubmissionStorage } from "../media-submission/pending";
import { createComposerCapabilitySet } from "./capability";
import { CreatePostDialog } from "./create-post-dialog";
import { createMemoryPendingSubmissionStorage } from "./pending-submission";
import { createPostComposerController, type PostComposerController } from "./controller";
import { defaultEventState } from "./defaults";
import { PostComposerWriteStep } from "./write-step";
import type { PostComposerProps } from "./types";

const disposers: Array<() => void> = [];

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
});

/** What the community page declares: conversation, song, and video only. */
const communitySurface: PostComposerProps = {
  availableCapabilities: ["text", "song", "video"],
  canCreateSongPost: true,
  mode: "text",
};

function mountWriteStep(props: PostComposerProps, options: { isMobile?: boolean } = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let controller!: PostComposerController;
  let dispose = () => {};
  createRoot(rootDispose => {
    dispose = rootDispose;
    solidRender(() => {
      controller = createPostComposerController(props, { isMobile: () => options.isMobile === true });
      return <PostComposerWriteStep controller={controller} />;
    }, container);
  });
  disposers.push(() => {
    dispose();
    container.remove();
  });
  return { container, controller };
}

function buttonLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("button"))
    .map(button => button.getAttribute("aria-label") ?? button.textContent?.trim() ?? "")
    .filter(label => label.length > 0);
}

function fileInputLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]'))
    .map(input => input.getAttribute("aria-label") ?? "");
}

function dropFile(container: HTMLElement, file: File): void {
  const zone = container.querySelector("[data-composer-drop-zone]");
  if (zone === null) throw new Error("the desktop composer has no drop zone");
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: { files: [file] } });
  zone.dispatchEvent(event);
}

describe("composer capability set", () => {
  test("tabs exclude event, which overlays the text tab rather than owning one", () => {
    const capabilities = createComposerCapabilitySet(["text", "event"]);
    expect(capabilities.tabs).toEqual(["text"]);
    expect(capabilities.allows("event")).toBe(true);
  });

  test("song stays ungranted until the host can publish as an author", () => {
    expect(createComposerCapabilitySet(["text", "song"]).allows("song")).toBe(false);
    expect(createComposerCapabilitySet(["text", "song"], { canCreateSongPost: true }).allows("song"))
      .toBe(true);
  });

  test("undeclared kinds are refused rather than defaulted", () => {
    const capabilities = createComposerCapabilitySet(["text", "video"]);
    for (const kind of ["link", "image", "song", "live", "file", "event"] as const) {
      expect(capabilities.allows(kind)).toBe(false);
    }
  });

  test("permitted keeps action order and drops the undeclared", () => {
    const capabilities = createComposerCapabilitySet(["text", "video", "song"], { canCreateSongPost: true });
    expect(capabilities.permitted([
      { kind: "link" as const },
      { kind: "video" as const },
      { kind: "event" as const },
      { kind: "song" as const },
    ])).toEqual([{ kind: "video" }, { kind: "song" }]);
  });
});

describe("declared capabilities gate every composer entrance", () => {
  test("the desktop toolbar offers only declared kinds", () => {
    const { container } = mountWriteStep(communitySurface);
    const labels = buttonLabels(container);
    expect(labels).toContain("Video");
    expect(labels).toContain("Song");
    for (const refused of ["Link", "Image", "Live", "File", "Add date and place"]) {
      expect(labels).not.toContain(refused);
    }
  });

  test("the mobile bar offers only declared kinds and hides an empty overflow", () => {
    // The fixed mobile bar renders through a Portal, so it lands on the body.
    mountWriteStep(communitySurface, { isMobile: true });
    const labels = buttonLabels(document.body);
    expect(labels).toContain("Video");
    expect(labels).toContain("Song");
    expect(labels).not.toContain("Link");
    expect(labels).not.toContain("Image");
    // Live, File and Event are the whole overflow sheet on this surface.
    expect(labels).not.toContain("More post attachments");
  });

  test("undeclared kinds have no file input to open", () => {
    const { container } = mountWriteStep(communitySurface);
    const labels = fileInputLabels(container);
    expect(labels).toContain("Upload video");
    expect(labels).toContain("Upload audio");
    expect(labels).not.toContain("Upload image");
    expect(labels).not.toContain("Upload downloadable file");
  });

  test("a drop of an undeclared kind is refused visibly and changes nothing", () => {
    const onModeChange = vi.fn();
    const { container, controller } = mountWriteStep({ ...communitySurface, onModeChange });
    dropFile(container, new File(["a,b"], "export.csv", { type: "text/csv" }));
    flush();
    expect(controller.tabs.activeTab).toBe("text");
    expect(controller.generic.file.upload).toBeNull();
    expect(onModeChange).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Downloadable files cannot be posted here.");
  });

  test("a drop of a declared kind still attaches where the composer owns it", () => {
    // No onVideoEntry: this composer keeps the video itself, so the drop has
    // somewhere to land. The hosted case is covered separately below.
    const { container, controller } = mountWriteStep(communitySurface);
    dropFile(container, new File([" "], "clip.mp4", { type: "video/mp4" }));
    flush();
    expect(controller.media.videoState.primaryVideoUpload?.name).toBe("clip.mp4");
  });

  test("a programmatic tab change to an undeclared tab fails closed", () => {
    const onModeChange = vi.fn();
    const { controller } = mountWriteStep({ ...communitySurface, onModeChange });
    controller.tabs.onTabChange("link");
    flush();
    expect(controller.tabs.activeTab).toBe("text");
    expect(onModeChange).not.toHaveBeenCalled();
    controller.tabs.onTabChange("video");
    flush();
    expect(controller.tabs.activeTab).toBe("video");
    expect(onModeChange).toHaveBeenCalledWith("video");
  });
});

describe("event data is never accepted where it cannot be submitted", () => {
  test("enabling event on a text-only surface is refused, not silently held", () => {
    const onEventChange = vi.fn();
    const { container, controller } = mountWriteStep({ ...communitySurface, onEventChange });
    controller.event.update({ ...defaultEventState(), enabled: true, isOnline: true });
    flush();
    // Refused at the boundary: the composer holds no event data, so the text
    // submission contract has nothing it could drop from the envelope.
    expect(controller.event.state.enabled).toBe(false);
    expect(onEventChange).not.toHaveBeenCalled();
    expect(container.querySelector('[aria-label="Online event"]')).toBeNull();
  });

  test("a surface that declares event still carries it", () => {
    const onEventChange = vi.fn();
    const { controller } = mountWriteStep({
      ...communitySurface,
      availableCapabilities: ["text", "song", "video", "event"],
      onEventChange,
    });
    controller.event.update({ ...defaultEventState(), enabled: true });
    flush();
    expect(controller.event.state.enabled).toBe(true);
    expect(onEventChange).toHaveBeenCalled();
  });
});

describe("event state that arrives rather than being selected", () => {
  test("an undeclared event prop is never held, shown, or reported as enabled", () => {
    const onEventChange = vi.fn();
    const { container, controller } = mountWriteStep({
      ...communitySurface,
      // A host that hands the composer event data it never declared.
      event: { ...defaultEventState(), enabled: true, isOnline: true },
      onEventChange,
    });
    expect(controller.event.state.enabled).toBe(false);
    expect(onEventChange).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Online event");
    expect(container.textContent).not.toContain("Date and place");
  });

  test("the mobile selected-event chip follows the same boundary", () => {
    const { container } = mountWriteStep({
      ...communitySurface,
      event: { ...defaultEventState(), enabled: true, isOnline: true },
    }, { isMobile: true });
    expect(document.body.textContent).not.toContain("Online event");
    expect(container.textContent).not.toContain("Online event");
  });

  test("a declared surface still receives the event state it was given", () => {
    const { container, controller } = mountWriteStep({
      ...communitySurface,
      availableCapabilities: ["text", "song", "video", "event"],
      event: { ...defaultEventState(), enabled: true, isOnline: true },
    });
    expect(controller.event.state.enabled).toBe(true);
    expect(container.querySelector('[aria-label="Online event"]')).not.toBeNull();
  });
});

describe("the community dialog's video entrance", () => {
  /** Renders the dialog exactly as the community page configures it. */
  function mountCommunityDialog() {
    const container = document.createElement("div");
    document.body.appendChild(container);
    let dispose = () => {};
    createRoot(rootDispose => {
      dispose = rootDispose;
      solidRender(() => (
        <CreatePostDialog
          communityContext={{ id: "community-one", name: "Pirate Harbor" }}
          mediaStorage={createMemoryMediaSubmissionStorage()}
          onOpenChange={() => {}}
          open
          personas={[{
            personaId: "persona-one",
            displayName: "Persona One",
            avatarRef: null,
            primaryPublicHandle: null,
            communityBinding: null,
          }]}
          principalId="account-one"
          storage={createMemoryPendingSubmissionStorage()}
        />
      ), container);
    });
    disposers.push(() => { dispose(); container.remove(); });
    return container;
  }

  test("a dropped video is refused rather than lost when the host owns video entry", async () => {
    mountCommunityDialog();
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const zone = document.body.querySelector("[data-composer-drop-zone]");
    expect(zone).not.toBeNull();
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
      value: { files: [new File([" "], "clip.mp4", { type: "video/mp4" })] },
    });
    zone!.dispatchEvent(event);
    flush();
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    // The dialog swaps this composer for its own video runtime on a video
    // mode change, and that runtime cannot receive a file staged here, so the
    // drop must not silently take that path.
    expect(document.body.textContent).toContain("Start a video with the Video action");
    expect(document.body.querySelector("[data-composer-drop-zone]")).not.toBeNull();
    expect(document.body.textContent).not.toContain("clip.mp4");
  });

  test("the Video action still reaches the host's video runtime", async () => {
    mountCommunityDialog();
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const video = [...document.body.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === "Video");
    expect(video).toBeDefined();
    video!.click();
    flush();
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    // Leaving the composer for the host's runtime is the supported entrance.
    expect(document.body.querySelector("[data-composer-drop-zone]")).toBeNull();
  });
});
