// Publish-preview derivation, ported from the React post-composer-preview.ts.
// The pure model remains separately testable even though the live composer now
// submits from its single write surface.

import type {
  LiveRoomParticipant,
  PlaybackState,
  PostCardContent,
  PostCardProps,
  StemKind,
} from "./post-card-preview-types";

import { buildPublicProfilePath } from "./reference-model";
import type {
  AttachmentState,
  ComposerEventState,
  ComposerTab,
  DerivativeStepState,
  LinkPreviewState,
  LiveComposerState,
  VideoDetailsState,
} from "./types";

export type SongPreviewStem = {
  kind: StemKind;
  label?: string;
  onDownload?: () => void;
};

export type SongFeaturePreview = {
  karaoke?: Extract<PostCardContent, { type: "song" }>["karaoke"];
  study?: Extract<PostCardContent, { type: "song" }>["study"];
};

function formatLiveStartsAtLabel(scheduleAt: string | undefined): string | undefined {
  const value = scheduleAt?.trim();
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return undefined;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

// Which body text feeds the preview caption: image/video use the caption
// field, everything else (including song — lyrics stay on the bundle) uses the
// post body. Ported from the React getPostComposerPreviewBody.
export function resolvePreviewBody(
  activeTab: ComposerTab,
  fields: { captionValue: string; textBodyValue: string },
): string {
  if (activeTab === "image" || activeTab === "video") {
    return fields.captionValue;
  }
  return fields.textBodyValue;
}

export function buildPostComposerPreviewContent({
  access,
  attachment,
  body,
  derivativeStep,
  fileAsset,
  linkPreview,
  price,
  vinylReleaseUrl,
  songTitle,
  title,
  videoDetails,
  videoPosterSrc,
  songPlayback,
  songFeaturePreview,
  songStems,
  onSongBuy,
  onSongDownload,
  liveCoverSrc,
  liveState,
  liveHostIdentity,
  liveGuestLabel,
}: {
  access: "free" | "paid";
  attachment: AttachmentState;
  body: string;
  derivativeStep?: DerivativeStepState;
  fileAsset?: {
    mimeType?: string | null;
    onDownload?: () => void;
    sizeBytes?: number | null;
  };
  linkPreview?: LinkPreviewState;
  liveCoverSrc?: string;
  liveState?: LiveComposerState;
  liveHostIdentity?: { label: string; href?: string; avatarSrc?: string };
  liveGuestLabel?: string;
  price: string;
  vinylReleaseUrl?: string;
  songTitle?: string;
  title: string;
  videoDetails?: VideoDetailsState;
  videoPosterSrc?: string;
  songPlayback?: {
    durationMs?: number;
    onPause?: () => void;
    onPlay?: () => void;
    onSeek?: (progressMs: number) => void;
    progressMs?: number;
    state: PlaybackState;
  };
  songFeaturePreview?: SongFeaturePreview;
  songStems?: SongPreviewStem[];
  onSongBuy?: () => void;
  onSongDownload?: () => void;
}): PostCardContent {
  const bodyText = body.trim();
  const accessMode = access === "paid" ? "locked" : "public";
  const priceLabel = price.trim() ? `$${price.trim()}` : undefined;

  if (!attachment) {
    return { type: "text", body: bodyText };
  }

  if (attachment.kind === "image") {
    return {
      type: "image",
      src: attachment.previewUrl ?? "",
      alt: title || "Post image",
      caption: bodyText || undefined,
    };
  }

  if (attachment.kind === "video") {
    const songReferences = derivativeStep?.visible && derivativeStep.trigger === "uses_song"
      ? derivativeStep.references ?? []
      : [];
    return {
      type: "video",
      src: attachment.previewUrl ?? "",
      aspectRatio: attachment.aspectRatio,
      posterSrc: videoPosterSrc ?? videoDetails?.thumbnail?.previewUrl,
      title: title || "Video",
      caption: bodyText || undefined,
      accessMode,
      listingMode: access === "paid" ? "listed" : "not_listed",
      listingStatus: access === "paid" ? "active" : undefined,
      priceLabel: access === "paid" ? priceLabel : undefined,
      hasEntitlement: access === "free",
      onBuy: access === "paid" ? () => undefined : undefined,
      playbackState: "idle",
      rightsBasis: songReferences.length ? "derivative" : undefined,
      upstreamAttributions: songReferences.length
        ? songReferences.map((reference) => ({
            assetId: reference.id,
            relationshipType: "references_song" as const,
            title: reference.title,
            artist: reference.subtitle,
            artistHref: reference.subtitle ? buildPublicProfilePath(reference.subtitle) : undefined,
          }))
        : undefined,
    };
  }

  if (attachment.kind === "link") {
    const href = attachment.url.trim() || "https://example.com";

    if (linkPreview?.provider === "x") {
      return {
        type: "embed",
        body: bodyText || undefined,
        canonicalUrl: linkPreview.canonicalUrl ?? href,
        originalUrl: linkPreview.originalUrl ?? href,
        preview: {
          authorName: linkPreview.embedPreview?.authorName,
          authorUrl: linkPreview.embedPreview?.authorUrl,
          text: linkPreview.embedPreview?.text ?? linkPreview.title,
          hasMedia: linkPreview.embedPreview?.hasMedia,
          mediaUrl: linkPreview.embedPreview?.mediaUrl,
        },
        oembedHtml: linkPreview.oembedHtml,
        provider: "x",
        renderMode: linkPreview.state === "embed" ? "official" : "preview",
        state: linkPreview.state ?? "preview",
      };
    }

    if (linkPreview?.provider === "youtube") {
      return {
        type: "embed",
        body: bodyText || undefined,
        canonicalUrl: linkPreview.canonicalUrl ?? href,
        originalUrl: linkPreview.originalUrl ?? href,
        preview: {
          authorName: linkPreview.embedPreview?.authorName,
          authorUrl: linkPreview.embedPreview?.authorUrl,
          thumbnailUrl: linkPreview.embedPreview?.thumbnailUrl,
          thumbnailWidth: linkPreview.embedPreview?.thumbnailWidth,
          thumbnailHeight: linkPreview.embedPreview?.thumbnailHeight,
          title: linkPreview.embedPreview?.text ?? linkPreview.title,
        },
        oembedHtml: linkPreview.oembedHtml,
        provider: "youtube",
        renderMode: linkPreview.state === "embed" ? "official" : "preview",
        state: linkPreview.state ?? "preview",
      };
    }

    return {
      type: "link",
      href,
      body: bodyText || undefined,
      linkLabel: href.replace(/^https?:\/\//i, ""),
      previewTitle: linkPreview?.title || undefined,
      previewImageSrc: linkPreview?.imageSrc,
    };
  }

  if (attachment.kind === "song") {
    const trackTitle = songTitle?.trim() || attachment.label || "Untitled track";
    const normalizedVinylReleaseUrl = vinylReleaseUrl?.trim() || null;
    const isPaid = access === "paid";
    const previewStems = songStems
      ?.filter((stem) => stem.onDownload)
      .map((stem) => ({
        accessPolicy: isPaid ? "purchasers_only" as const : "free" as const,
        kind: stem.kind,
        label: stem.label,
        onDownload: stem.onDownload,
      }));

    return {
      type: "song",
      title: trackTitle,
      caption: bodyText || undefined,
      artworkSrc: attachment.artworkUrl,
      accessMode,
      listingMode: access === "paid" ? "listed" : "not_listed",
      listingStatus: access === "paid" ? "active" : undefined,
      priceLabel: access === "paid" ? priceLabel : undefined,
      hasEntitlement: access === "free",
      karaoke: songFeaturePreview?.karaoke,
      study: songFeaturePreview?.study,
      downloadPolicy: onSongDownload
        ? access === "paid" ? "purchased_download" : "free_download"
        : undefined,
      onBuy: access === "paid" ? onSongBuy : undefined,
      onDownload: access === "free" ? onSongDownload : undefined,
      stems: previewStems?.length ? previewStems : undefined,
      entitledStems: access === "free" && previewStems?.length
        ? previewStems.map((stem) => stem.kind)
        : undefined,
      vinylRelease: normalizedVinylReleaseUrl
        ? {
            available: true,
            provider: "elasticstage",
            url: normalizedVinylReleaseUrl,
          }
        : undefined,
      onPause: songPlayback?.onPause,
      onPlay: attachment.previewUrl ? songPlayback?.onPlay : undefined,
      onSeek: attachment.previewUrl ? songPlayback?.onSeek : undefined,
      playbackState: songPlayback?.state ?? "idle",
      progressMs: songPlayback?.progressMs,
      durationMs: songPlayback?.durationMs,
    };
  }

  if (attachment.kind === "file") {
    return {
      type: "generic_asset",
      assetId: "composer-preview-file",
      assetKind: "download_file",
      communityId: "composer-preview",
      title: title.trim() || attachment.label || "Downloadable file",
      filename: attachment.label ?? null,
      mimeType: fileAsset?.mimeType ?? null,
      sizeBytes: fileAsset?.sizeBytes ?? null,
      accessMode,
      listingMode: access === "paid" ? "listed" : "not_listed",
      listingStatus: access === "paid" ? "active" : undefined,
      priceLabel: access === "paid" ? priceLabel : undefined,
      hasEntitlement: access === "free",
      onBuy: access === "paid" ? () => undefined : undefined,
      onDownload: access === "free" ? fileAsset?.onDownload : undefined,
    };
  }

  if (attachment.kind === "live") {
    const liveAccessMode = liveState?.accessMode ?? "free";
    const participants: LiveRoomParticipant[] | undefined = liveHostIdentity
      ? [
          { role: "host", ...liveHostIdentity },
          ...(liveGuestLabel ? [{ role: "guest" as const, label: liveGuestLabel }] : []),
        ]
      : undefined;

    return {
      type: "live_room",
      liveRoomId: "composer-preview-live-room",
      title: title.trim() || "Live event",
      description: bodyText || liveState?.description,
      coverSrc: liveCoverSrc,
      roomKind: liveState?.roomKind ?? "solo",
      status: "scheduled",
      accessMode: liveAccessMode,
      visibility: liveState?.visibility ?? "public",
      accessState: liveAccessMode === "paid"
        ? "purchase_required"
        : liveAccessMode === "free"
          ? "waiting"
          : undefined,
      concertHref: "#",
      startsAtLabel: liveState?.scheduleForLater
        ? formatLiveStartsAtLabel(liveState.scheduleAt)
        : undefined,
      setlistPreview: liveState?.setlistItems
        .filter((item) => item.titleText.trim())
        .slice(0, 3)
        .map((item) => ({
          title: item.titleText.trim(),
          artist: item.artistText?.trim() || undefined,
          rightsStatus: "pending" as const,
        })),
      listingMode: liveAccessMode === "paid" ? "listed" : "not_listed",
      listingStatus: liveAccessMode === "paid" ? "active" : undefined,
      onBuy: liveAccessMode === "paid" ? () => undefined : undefined,
      priceLabel: liveAccessMode === "paid" ? priceLabel : undefined,
      hasEntitlement: false,
      participants,
    };
  }

  return {
    type: "text",
    body: bodyText || "Live event",
  };
}

// Event attached to the preview card (skipped for live attachments, which
// carry their own schedule). Ported from the React buildPreviewEvent.
export function buildPreviewEvent(event: ComposerEventState): PostCardProps["event"] | undefined {
  if (event.enabled !== true || !event.startsAt?.trim()) {
    return undefined;
  }
  const timezone = event.timezone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: timezone }).format(new Date());
  } catch {
    return undefined;
  }

  return {
    address: event.isOnline ? undefined : event.address?.trim() || undefined,
    endsAt: event.endsAt?.trim() || undefined,
    eventUrl: event.eventUrl?.trim() || undefined,
    isOnline: event.isOnline === true,
    locationName: event.isOnline ? undefined : event.locationName?.trim() || undefined,
    place: event.isOnline ? undefined : event.place,
    startsAt: event.startsAt.trim(),
    status: "scheduled",
    timezone,
  };
}
