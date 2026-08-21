import { createEffect, createSignal, Show } from "solid-js";

import {
  CardContent,
  FormNote,
  IconLock,
  IconMusicNote,
  IconUploadSimple,
  Input,
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
  Textarea,
  Type,
  pillButtonVariants,
} from "../../../design-system";
import { cn } from "../../../design-system";
import { PostComposerGenericAssetFields } from "./generic-asset-fields";
import {
  PostComposerDesktopAttachmentToolbar,
  PostComposerMobileAttachmentBar,
} from "./attachment-bar";
import { PostComposerAttachmentCard } from "./attachment-card";
import { attachmentActions, overflowMobileAttachmentActions, primaryMobileAttachmentActions } from "./defaults";
import { PostComposerEventSection } from "./event-section";
import { LiveTabContent } from "./live-tab";
import { PostComposerSettingsHub } from "./settings-hub";
import { PostComposerPublishControls } from "./publish-controls";
import { buildRightsSummary, PostComposerRightsSheet } from "./rights-sheet";
import {
  createKeyboardBottomOffset,
  createObjectUrl,
  createVideoPosterUrl,
  createVideoSourceAspectRatio,
} from "./media-hooks";
import type { AttachmentKind, AttachmentState, ComposerToolbarAction } from "./types";
import type { PostComposerController } from "./controller";

const imageExtensions = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "heic", "heif", "avif"]);
const videoExtensions = new Set(["mp4", "mov", "avi", "mkv", "webm", "flv", "wmv", "m4v", "3gp", "ts", "mts"]);
const audioExtensions = new Set(["mp3", "wav", "flac", "aac", "ogg", "m4a", "wma", "aiff", "opus"]);
const downloadExtensions = new Set(["csv", "tsv", "txt", "json"]);

function fileExtension(name: string): string | null {
  const index = name.lastIndexOf(".");
  return index > -1 && index < name.length - 1 ? name.slice(index + 1).toLowerCase() : null;
}

function fileKind(file: File): AttachmentKind | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "song";
  const extension = fileExtension(file.name);
  if (!extension) return null;
  if (imageExtensions.has(extension)) return "image";
  if (videoExtensions.has(extension)) return "video";
  if (audioExtensions.has(extension)) return "song";
  if (downloadExtensions.has(extension)) return "file";
  return null;
}

function titleFromFilename(name: string): string {
  const index = name.lastIndexOf(".");
  return (index > 0 ? name.slice(0, index) : name).trim();
}

function bodyValue(controller: PostComposerController): string {
  return controller.tabs.activeTab === "image" || controller.tabs.activeTab === "video"
    ? controller.fields.captionValue
    : controller.fields.textBodyValue;
}

function updateBody(controller: PostComposerController, value: string) {
  if (controller.tabs.activeTab === "image" || controller.tabs.activeTab === "video") {
    controller.fields.onCaptionValueChange?.(value);
  } else {
    controller.fields.onTextBodyValueChange?.(value);
  }
}

function attachmentFor(
  controller: PostComposerController,
  imagePreview: string | undefined,
  videoPoster: string | undefined,
  videoPreview: string | undefined,
  videoAspectRatio: number | undefined,
  songArtwork: string | undefined,
): AttachmentState {
  const { fields, media, song, tabs } = controller;
  if (tabs.activeTab === "link") return { kind: "link", url: fields.linkUrlValue };
  if (tabs.activeTab === "image") return { kind: "image", label: media.activeImageUpload?.name ?? media.imageUploadLabel ?? "Image", previewUrl: imagePreview };
  if (tabs.activeTab === "video") return { kind: "video", label: media.videoState.primaryVideoUpload?.name ?? media.videoState.primaryVideoLabel ?? "Video", aspectRatio: videoAspectRatio, posterUrl: videoPoster, previewUrl: videoPreview };
  if (tabs.activeTab === "song") return { kind: "song", label: song.state.primaryAudioUpload?.name ?? song.state.primaryAudioLabel ?? "Audio file", artworkUrl: songArtwork };
  if (tabs.activeTab === "live") return { kind: "live" };
  if (tabs.activeTab === "file") return { kind: "file", label: controller.generic.file.upload?.name ?? controller.generic.file.label ?? "Downloadable file" };
  return null;
}

export function PostComposerWriteStep(props: {
  controller: PostComposerController;
  initialOpenPanel?: "access-and-rights" | "visibility";
  initialRightsSection?: "rights" | "license" | "payout";
}) {
  const controller = props.controller;
  const imagePreview = createObjectUrl(() => controller.media.activeImageUpload);
  const videoPreview = createObjectUrl(() => controller.media.videoState.primaryVideoUpload);
  const detectedVideoAspectRatio = createVideoSourceAspectRatio(videoPreview);
  const videoAspectRatio = () => detectedVideoAspectRatio() ?? controller.media.videoState.primaryVideoAspectRatio;
  const videoPoster = createVideoPosterUrl(() => controller.media.videoState.primaryVideoUpload);
  const songArtwork = createObjectUrl(() => controller.song.state.coverUpload);
  const attachment = () => attachmentFor(controller, imagePreview(), videoPoster(), videoPreview(), videoAspectRatio(), songArtwork());
  const keyboardOffset = createKeyboardBottomOffset();
  const [activeTool, setActiveTool] = createSignal<ComposerToolbarAction | null>(null);
  const [accessOpen, setAccessOpen] = createSignal(props.initialOpenPanel === "access-and-rights");
  const [moreOpen, setMoreOpen] = createSignal(false);
  const [dragging, setDragging] = createSignal(false);
  let dragCounter = 0;
  let imageInput: HTMLInputElement | undefined;
  let videoInput: HTMLInputElement | undefined;
  let songInput: HTMLInputElement | undefined;
  let fileInput: HTMLInputElement | undefined;

  const showAccessRights = () => ["song", "video", "live"].includes(controller.tabs.activeTab);

  createEffect(
    () => detectedVideoAspectRatio(),
    (detected) => {
      if (typeof detected !== "number") return;
      if (controller.media.videoState.primaryVideoAspectRatio === detected) return;
      controller.media.updateVideoState((current) => current.primaryVideoAspectRatio === detected
        ? current
        : { ...current, primaryVideoAspectRatio: detected });
    },
  );

  const selectAttachment = (kind: ComposerToolbarAction) => {
    setActiveTool(kind);
    if (kind === "event") {
      controller.event.update({ ...controller.event.state, enabled: true });
      return;
    }
    if (kind === "image") return imageInput?.click();
    if (kind === "video") return videoInput?.click();
    if (kind === "song") return songInput?.click();
    if (kind === "file") return fileInput?.click();
    controller.tabs.onTabChange(kind);
  };

  const removeAttachment = () => {
    const current = attachment();
    if (current?.kind === "image") controller.media.setImageUpload(null);
    if (current?.kind === "video") controller.media.updateVideoState((state) => ({ ...state, primaryVideoUpload: null, primaryVideoLabel: undefined, primaryVideoAspectRatio: undefined }));
    if (current?.kind === "song") controller.song.update((state) => ({ ...state, primaryAudioUpload: null, primaryAudioLabel: undefined }));
    if (current?.kind === "link") controller.fields.onLinkUrlValueChange?.("");
    if (current?.kind === "file") controller.generic.setFile({ upload: null, label: undefined });
    controller.tabs.onTabChange("text");
    setActiveTool(null);
  };

  const handleFile = (file: File) => {
    const kind = fileKind(file);
    if (!kind) return;
    if (kind === "image") {
      controller.media.setImageUpload(file);
    } else if (kind === "video") {
      controller.media.updateVideoState((state) => ({ ...state, primaryVideoUpload: file, primaryVideoLabel: file.name, posterFrameSeconds: "0" }));
    } else if (kind === "song") {
      controller.song.update((state) => ({ ...state, primaryAudioUpload: file, primaryAudioLabel: file.name, title: state.title?.trim() ? state.title : titleFromFilename(file.name) }));
    } else {
      controller.generic.setFile({ upload: file, label: file.name });
    }
    controller.tabs.onTabChange(kind);
  };

  const input = (kind: AttachmentKind, files: FileList | null) => {
    const file = files?.[0];
    if (file) handleFile(file);
    if (kind === "image" && imageInput) imageInput.value = "";
  };

  const drop = (event: DragEvent) => {
    event.preventDefault();
    dragCounter = 0;
    setDragging(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  };

  const Inputs = () => (
    <>
      <input accept="image/*" aria-label="Upload image" class="sr-only" ref={imageInput} type="file" onChange={(event) => input("image", event.currentTarget.files)} />
      <input accept="video/*" aria-label="Upload video" class="sr-only" ref={videoInput} type="file" onChange={(event) => input("video", event.currentTarget.files)} />
      <input accept="audio/*" aria-label="Upload audio" class="sr-only" ref={songInput} type="file" onChange={(event) => input("song", event.currentTarget.files)} />
      <input accept=".csv,.tsv,.txt,.json,text/csv,text/tab-separated-values,text/plain,application/json" aria-label="Upload downloadable file" class="sr-only" ref={fileInput} type="file" onChange={(event) => input("file", event.currentTarget.files)} />
    </>
  );

  const body = (mobile: boolean) => (
    <>
      <div class="flex items-start gap-3">
        <Show when={!mobile} fallback={
          <Input
            class="h-auto min-w-0 flex-1 px-0 py-0 text-3xl font-semibold leading-tight shadow-none focus-visible:border-transparent focus-visible:ring-0"
            maxlength={300}
            onChange={(event) => controller.fields.onTitleValueChange?.(event.currentTarget.value)}
            placeholder={controller.copy.placeholders.title}
            variant="flat"
            value={controller.fields.titleValue}
          />
        }>
          <Input maxlength={300} onChange={(event) => controller.fields.onTitleValueChange?.(event.currentTarget.value)} placeholder="Title*" size="title" value={controller.fields.titleValue} />
        </Show>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <PostComposerPublishControls
          controller={controller}
          initialOpen={props.initialOpenPanel === "visibility"}
        />
        <Show when={showAccessRights()}>
          <Modal open={accessOpen()} onOpenChange={setAccessOpen}>
            <ModalTrigger
              aria-label={controller.tabs.activeTab === "song"
                ? buildRightsSummary(controller)
                : controller.copy.publishChips.accessRightsTitle}
              class={cn(pillButtonVariants({ tone: "default" }), "h-11 min-w-0 gap-2 px-3.5 text-foreground")}
            >
              <IconLock class="size-4" />
              <Type as="span" variant="label">
                {controller.tabs.activeTab === "song"
                  ? buildRightsSummary(controller)
                  : controller.copy.publishChips.accessRightsTitle}
              </Type>
            </ModalTrigger>
            <ModalContent
              class="max-h-[88dvh] overflow-y-auto rounded-t-[var(--radius-3xl)] px-0 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 sm:rounded-[var(--radius-xl)] sm:pb-6 sm:pt-6"
              mobileSide="bottom"
            >
              <div aria-hidden="true" class="mx-auto mb-4 h-1 w-12 rounded-full bg-muted sm:hidden" />
              <Show
                when={controller.tabs.activeTab === "song"}
                fallback={
                  <>
                    <ModalHeader class="px-4 pe-12 text-start">
                      <ModalTitle>{controller.copy.publishChips.accessRightsTitle}</ModalTitle>
                    </ModalHeader>
                    <PostComposerSettingsHub controller={controller} />
                  </>
                }
              >
                <PostComposerRightsSheet
                  controller={controller}
                  initialSection={props.initialRightsSection}
                  onDone={() => setAccessOpen(false)}
                />
              </Show>
            </ModalContent>
          </Modal>
        </Show>
      </div>
      <PostComposerAttachmentCard attachment={attachment()} onChange={(next) => { if (next?.kind === "link") { controller.fields.onLinkUrlValueChange?.(next.url); controller.tabs.onTabChange("link"); } }} onRemove={removeAttachment} onReplace={selectAttachment} />
      <Show when={controller.tabs.activeTab === "song" && controller.requirements.songAudioMissing}>
        <FormNote class="flex items-center gap-2" tone="warning">
          <IconMusicNote class="size-4 shrink-0" />
          Choose a song from the toolbar to publish.
        </FormNote>
      </Show>
      <Show when={controller.tabs.activeTab === "file"}><PostComposerGenericAssetFields file={controller.generic.file} onFileChange={controller.generic.setFile} /></Show>
      <Textarea class={cn("resize-none text-xl leading-relaxed", mobile ? "min-h-[38dvh] rounded-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" : "min-h-36")} onChange={(event) => updateBody(controller, event.currentTarget.value)} placeholder={attachment() ? controller.copy.placeholders.optional : controller.copy.placeholders.body} value={bodyValue(controller)} />
      <Show when={controller.tabs.activeTab === "live"} fallback={<Show when={controller.tabs.activeTab !== "song" && controller.event.state.enabled}><PostComposerEventSection event={controller.event.state} onChange={controller.event.update} onSearchPlaces={controller.event.searchPlaces} /></Show>}>
        <LiveTabContent copy={controller.copy} live={controller.primary.liveState} onLiveChange={controller.primary.setLiveState} />
      </Show>
    </>
  );

  return (
    <>
      <Show when={controller.isMobile()} fallback={
      <CardContent class={cn("relative space-y-5 p-6", dragging() && "overflow-hidden")} onDragEnter={(event) => { event.preventDefault(); dragCounter += 1; setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { event.preventDefault(); dragCounter -= 1; if (dragCounter <= 0) setDragging(false); }} onDrop={drop}>
        <Show when={dragging()}><div class="absolute inset-0 z-10 grid place-items-center rounded-[var(--radius-lg)] border-2 border-dashed border-primary bg-primary-subtle/80"><div class="flex flex-col items-center gap-3"><IconUploadSimple class="size-10 text-primary" /><Type as="p" variant="body-strong" class="text-primary">Drop a file to attach it</Type></div></div></Show>
        {body(false)}
        <PostComposerDesktopAttachmentToolbar actions={attachmentActions} activeKind={activeTool() ?? attachment()?.kind ?? null} onSelect={selectAttachment} />
        <Inputs />
      </CardContent>
    }>
      <div class="space-y-4 px-0 pb-24 pt-1" style={{ "padding-bottom": `${96 + keyboardOffset()}px` }}>{body(true)}</div>
      <Show when={controller.event.state.enabled && controller.tabs.activeTab !== "song" && controller.tabs.activeTab !== "live"}>
        <div class="flex flex-wrap gap-2 px-1" aria-label="Selected post options">
          <Type as="span" variant="caption" class="text-muted-foreground">
            {controller.event.state.isOnline ? "Online event" : "Date and place"}
          </Type>
        </div>
      </Show>
      <PostComposerMobileAttachmentBar
        actions={primaryMobileAttachmentActions}
        activeKind={activeTool() ?? attachment()?.kind ?? null}
        bottomOffset={keyboardOffset()}
        onMore={() => setMoreOpen(true)}
        onSelect={selectAttachment}
      />
      <Inputs />
      <Modal open={moreOpen()} onOpenChange={setMoreOpen}>
        <ModalContent
          class="rounded-t-[var(--radius-3xl)] px-0 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 sm:rounded-[var(--radius-xl)] sm:pb-6 sm:pt-6"
          mobileSide="bottom"
        >
          <div aria-hidden="true" class="mx-auto mb-4 h-1 w-12 rounded-full bg-muted sm:hidden" />
          <ModalHeader class="px-4 pe-12 text-start">
            <ModalTitle>More post attachments</ModalTitle>
          </ModalHeader>
          <div class="space-y-2 px-4 pt-5">
            <PostComposerDesktopAttachmentToolbar
              actions={overflowMobileAttachmentActions}
              activeKind={activeTool() ?? attachment()?.kind ?? null}
              onSelect={(kind) => {
                setMoreOpen(false);
                selectAttachment(kind);
              }}
            />
          </div>
        </ModalContent>
      </Modal>
      </Show>
    </>
  );
}
