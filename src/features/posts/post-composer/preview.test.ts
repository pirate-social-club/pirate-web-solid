import { describe, expect, test } from "bun:test";

import { buildPostComposerPreviewContent, resolvePreviewBody } from "./preview";

describe("buildPostComposerPreviewContent", () => {
  test("does not request third-party fallback media while local URLs initialize", () => {
    const image = buildPostComposerPreviewContent({
      access: "free",
      attachment: { kind: "image", label: "photo.jpg" },
      body: "",
      price: "",
      title: "Photo",
    });
    const video = buildPostComposerPreviewContent({
      access: "free",
      attachment: { kind: "video", label: "clip.mp4" },
      body: "",
      price: "",
      title: "Clip",
    });

    expect(image.type === "image" ? image.src : undefined).toBe("");
    expect(video.type === "video" ? video.src : undefined).toBe("");
  });

  test("uses the selected video poster frame for the publish preview", () => {
    const content = buildPostComposerPreviewContent({
      access: "free",
      attachment: {
        kind: "video",
        label: "clip.mp4",
        previewUrl: "blob:https://app.test/video",
      },
      body: "First line\n\n- one\n- two",
      price: "",
      title: "Clip",
      videoPosterSrc: "data:image/jpeg;base64,poster-frame",
    });

    expect(content).toMatchObject({
      type: "video",
      caption: "First line\n\n- one\n- two",
      posterSrc: "data:image/jpeg;base64,poster-frame",
      src: "blob:https://app.test/video",
    });
  });

  test("shows paid video publish previews from the audience perspective", () => {
    const content = buildPostComposerPreviewContent({
      access: "paid",
      attachment: {
        kind: "video",
        label: "locked-clip.mp4",
        previewUrl: "blob:https://app.test/video",
      },
      body: "",
      price: "4.99",
      title: "Locked clip",
    });

    expect(content).toMatchObject({
      type: "video",
      accessMode: "locked",
      hasEntitlement: false,
      listingMode: "listed",
      listingStatus: "active",
      priceLabel: "$4.99",
      src: "blob:https://app.test/video",
    });
    expect(typeof (content.type === "video" ? content.onBuy : undefined)).toBe("function");
  });

  test("maps song body text into a caption for the publish preview", () => {
    const content = buildPostComposerPreviewContent({
      access: "free",
      attachment: {
        kind: "song",
        label: "track.wav",
        previewUrl: "blob:https://app.test/song",
      },
      body: "First line\n\n- one\n- two",
      price: "",
      title: "Track",
    });

    expect(content).toMatchObject({
      type: "song",
      caption: "First line\n\n- one\n- two",
    });
    expect(content.type === "song" ? content.artworkSrc : undefined).toBeUndefined();
  });

  test("builds live room content for live publish preview", () => {
    const content = buildPostComposerPreviewContent({
      access: "paid",
      attachment: { kind: "live" },
      body: "A short live set.",
      liveCoverSrc: "blob:https://app.test/live-cover",
      liveState: {
        roomKind: "duet",
        accessMode: "paid",
        visibility: "public",
        scheduleForLater: true,
        scheduleAt: "2026-05-22T22:00",
        guestUserId: "u/guest",
        coverLabel: "cover.jpg",
        setlistItems: [
          {
            titleText: "After Hours",
            artistText: "DJ Solar",
            performanceKind: "original",
          },
        ],
        setlistStatus: "draft",
        performerAllocations: [
          { userId: "u/host", role: "host", sharePct: 60 },
          { userId: "u/guest", role: "guest", sharePct: 40 },
        ],
      },
      price: "5",
      title: "Late set",
    });

    expect(content).toMatchObject({
      type: "live_room",
      title: "Late set",
      description: "A short live set.",
      coverSrc: "blob:https://app.test/live-cover",
      roomKind: "duet",
      status: "scheduled",
      accessMode: "paid",
      accessState: "purchase_required",
      priceLabel: "$5",
      setlistPreview: [
        {
          title: "After Hours",
          artist: "DJ Solar",
          rightsStatus: "pending",
        },
      ],
    });
    expect(content.type === "live_room" ? content.startsAtLabel : undefined).toContain("2026");
  });

  test("does not show a scheduled start label for immediate live previews", () => {
    const content = buildPostComposerPreviewContent({
      access: "free",
      attachment: { kind: "live" },
      body: "",
      liveState: {
        roomKind: "solo",
        accessMode: "free",
        visibility: "public",
        scheduleForLater: false,
        scheduleAt: "2026-05-22T22:00",
        setlistItems: [{ titleText: "After Hours", performanceKind: "original" }],
        setlistStatus: "draft",
        performerAllocations: [{ userId: "u/host", role: "host", sharePct: 100 }],
      },
      price: "",
      title: "Live now",
    });

    expect(content.type === "live_room" ? content.startsAtLabel : undefined).toBeUndefined();
  });

  test("does not mark gated live publish previews as needing viewer verification", () => {
    const content = buildPostComposerPreviewContent({
      access: "free",
      attachment: { kind: "live" },
      body: "",
      liveState: {
        roomKind: "duet",
        accessMode: "gated",
        visibility: "public",
        scheduleForLater: true,
        scheduleAt: "2026-05-22T22:00",
        guestUserId: "name.pirate",
        setlistItems: [{ titleText: "After Hours", performanceKind: "original" }],
        setlistStatus: "draft",
        performerAllocations: [
          { userId: "u/host", role: "host", sharePct: 50 },
          { userId: "name.pirate", role: "guest", sharePct: 50 },
        ],
      },
      liveGuestLabel: "name.pirate",
      liveHostIdentity: { label: "Host" },
      price: "",
      title: "Duet preview",
    });

    expect(content).toMatchObject({
      type: "live_room",
      accessMode: "gated",
      participants: [
        { role: "host", label: "Host" },
        { role: "guest", label: "name.pirate" },
      ],
    });
    expect(content.type === "live_room" ? content.accessState : undefined).toBeUndefined();
    expect(content.type === "live_room" ? content.onWatch : undefined).toBeUndefined();
  });

  test("uses song post body, not media caption or lyrics, for publish preview captions", () => {
    const body = resolvePreviewBody("song", {
      captionValue: "Image/video caption",
      textBodyValue: "Song post caption",
    });

    expect(body).toBe("Song post caption");
    expect(resolvePreviewBody("video", {
      captionValue: "Image/video caption",
      textBodyValue: "Song post caption",
    })).toBe("Image/video caption");
  });

  test("keeps local song artwork and playback wired in the publish preview", () => {
    const content = buildPostComposerPreviewContent({
      access: "free",
      attachment: {
        kind: "song",
        artworkUrl: "blob:https://app.test/cover",
        label: "track.wav",
        previewUrl: "blob:https://app.test/song",
      },
      body: "Lyrics shown on the post",
      price: "",
      songPlayback: {
        onPlay: () => undefined,
        onPause: () => undefined,
        state: "idle",
      },
      title: "Track",
    });

    expect(content).toMatchObject({
      type: "song",
      artworkSrc: "blob:https://app.test/cover",
      caption: "Lyrics shown on the post",
      playbackState: "idle",
    });
    expect(typeof (content.type === "song" ? content.onPlay : undefined)).toBe("function");
  });

  test("builds free song download rows for original and local stems", () => {
    const content = buildPostComposerPreviewContent({
      access: "free",
      attachment: {
        kind: "song",
        label: "track.wav",
        previewUrl: "blob:https://app.test/song",
      },
      body: "",
      onSongDownload: () => undefined,
      price: "",
      songStems: [
        { kind: "instrumental", label: "Instrumental", onDownload: () => undefined },
        { kind: "vocals", label: "Vocals", onDownload: () => undefined },
      ],
      title: "Track",
      vinylReleaseUrl: "https://elasticstage.com/artist/releases/free-single",
    });

    expect(content).toMatchObject({
      type: "song",
      accessMode: "public",
      downloadPolicy: "free_download",
      hasEntitlement: true,
      vinylRelease: {
        available: true,
        provider: "elasticstage",
        url: "https://elasticstage.com/artist/releases/free-single",
      },
    });
    expect(typeof (content.type === "song" ? content.onDownload : undefined)).toBe("function");
    expect(content.type === "song" ? content.stems : undefined).toMatchObject([
      { accessPolicy: "free", kind: "instrumental", label: "Instrumental" },
      { accessPolicy: "free", kind: "vocals", label: "Vocals" },
    ]);
    expect(content.type === "song" ? content.entitledStems : undefined).toEqual(["instrumental", "vocals"]);
  });

  test("builds paid song purchase rows on the song content itself", () => {
    const content = buildPostComposerPreviewContent({
      access: "paid",
      attachment: {
        kind: "song",
        label: "track.wav",
        previewUrl: "blob:https://app.test/song",
      },
      body: "",
      onSongBuy: () => undefined,
      onSongDownload: () => undefined,
      price: "4.99",
      songStems: [
        { kind: "instrumental", label: "Instrumental", onDownload: () => undefined },
      ],
      title: "Track",
    });

    expect(content).toMatchObject({
      type: "song",
      accessMode: "locked",
      downloadPolicy: "purchased_download",
      hasEntitlement: false,
      listingMode: "listed",
      listingStatus: "active",
      priceLabel: "$4.99",
      stems: [
        { accessPolicy: "purchasers_only", kind: "instrumental", label: "Instrumental" },
      ],
    });
    expect(typeof (content.type === "song" ? content.onBuy : undefined)).toBe("function");
    expect(content.type === "song" ? content.onDownload : undefined).toBeUndefined();
    expect(content.type === "song" ? content.entitledStems : undefined).toBeUndefined();
  });

  test("adds optimistic study and karaoke states to song publish previews", () => {
    const content = buildPostComposerPreviewContent({
      access: "paid",
      attachment: {
        kind: "song",
        label: "track.wav",
        previewUrl: "blob:https://app.test/song",
      },
      body: "",
      price: "4.99",
      songFeaturePreview: {
        karaoke: { status: "processing" },
        study: { status: "processing" },
      },
      title: "Track",
    });

    expect(content).toMatchObject({
      type: "song",
      karaoke: { status: "processing" },
      study: { status: "processing" },
    });
  });

  test("uses canonical song title instead of upload label for the publish preview", () => {
    const content = buildPostComposerPreviewContent({
      access: "free",
      attachment: {
        kind: "song",
        label: "demo-upload.wav",
        previewUrl: "blob:https://app.test/song",
      },
      body: "",
      price: "",
      songTitle: "Midnight Signal",
      title: "New drop",
    });

    expect(content).toMatchObject({
      type: "song",
      title: "Midnight Signal",
    });
  });

  test("shows the selected source song in video publish previews", () => {
    const content = buildPostComposerPreviewContent({
      access: "free",
      attachment: {
        kind: "video",
        label: "dance.mp4",
        previewUrl: "blob:https://app.test/video",
      },
      body: "",
      derivativeStep: {
        visible: true,
        trigger: "uses_song",
        references: [{
          id: "story:asset:asset_song",
          title: "Midnight Signal",
          subtitle: "artist.pirate",
        }],
      },
      price: "",
      title: "Dance clip",
    });

    expect(content).toMatchObject({
      type: "video",
      rightsBasis: "derivative",
      upstreamAttributions: [{
        assetId: "story:asset:asset_song",
        relationshipType: "references_song",
        title: "Midnight Signal",
        artist: "artist.pirate",
        artistHref: "/u/artist.pirate",
      }],
    });
  });

  test("uses fetched link preview title instead of typed title for generic links", () => {
    const content = buildPostComposerPreviewContent({
      access: "free",
      attachment: { kind: "link", url: "https://example.com/article" },
      body: "",
      linkPreview: {
        domain: "example.com",
        title: "OG Article Title",
        imageSrc: "https://example.com/image.jpg",
      },
      price: "",
      title: "My typed title",
    });

    expect(content).toMatchObject({
      type: "link",
      previewTitle: "OG Article Title",
      previewImageSrc: "https://example.com/image.jpg",
    });
  });

  test("builds embed content for X links when linkPreview has provider x", () => {
    const content = buildPostComposerPreviewContent({
      access: "free",
      attachment: { kind: "link", url: "https://x.com/user/status/123" },
      body: "Check this out",
      linkPreview: {
        domain: "x.com",
        provider: "x",
        canonicalUrl: "https://x.com/user/status/123",
        originalUrl: "https://x.com/user/status/123",
        state: "embed",
        oembedHtml: `<blockquote class="twitter-tweet"><p>Tweet content here</p></blockquote>`,
        embedPreview: {
          authorName: "Test User",
          text: "Tweet content here",
          hasMedia: true,
          mediaUrl: "https://pic.x.com/abc.jpg",
        },
      },
      price: "",
      title: "My post title",
    });

    expect(content).toMatchObject({
      type: "embed",
      provider: "x",
      renderMode: "official",
      state: "embed",
      oembedHtml: `<blockquote class="twitter-tweet"><p>Tweet content here</p></blockquote>`,
      preview: {
        authorName: "Test User",
        text: "Tweet content here",
        hasMedia: true,
        mediaUrl: "https://pic.x.com/abc.jpg",
      },
    });
  });

  test("builds embed content for YouTube links when linkPreview has provider youtube", () => {
    const content = buildPostComposerPreviewContent({
      access: "free",
      attachment: { kind: "link", url: "https://youtube.com/watch?v=dQw4w9WgXcQ" },
      body: "",
      linkPreview: {
        domain: "youtube.com",
        provider: "youtube",
        canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        originalUrl: "https://youtube.com/watch?v=dQw4w9WgXcQ",
        state: "embed",
        oembedHtml: `<iframe title="Never Gonna Give You Up" src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"></iframe>`,
        embedPreview: {
          authorName: "Rick Astley",
          thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
          thumbnailWidth: 480,
          thumbnailHeight: 360,
          text: "Never Gonna Give You Up",
        },
      },
      price: "",
      title: "My post title",
    });

    expect(content).toMatchObject({
      type: "embed",
      provider: "youtube",
      renderMode: "official",
      state: "embed",
      oembedHtml: `<iframe title="Never Gonna Give You Up" src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"></iframe>`,
      preview: {
        authorName: "Rick Astley",
        thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        title: "Never Gonna Give You Up",
      },
    });
  });

  test("uses lightweight preview mode when an embed is not hydrated", () => {
    const content = buildPostComposerPreviewContent({
      access: "free",
      attachment: { kind: "link", url: "https://x.com/user/status/123" },
      body: "",
      linkPreview: {
        domain: "x.com",
        provider: "x",
        canonicalUrl: "https://x.com/user/status/123",
        originalUrl: "https://x.com/user/status/123",
        state: "preview",
        embedPreview: {
          text: "Tweet content here",
        },
      },
      price: "",
      title: "My post title",
    });

    expect(content).toMatchObject({
      type: "embed",
      provider: "x",
      renderMode: "preview",
      state: "preview",
    });
  });

  test("falls back to generic link card when no linkPreview is available", () => {
    const content = buildPostComposerPreviewContent({
      access: "free",
      attachment: { kind: "link", url: "https://example.com" },
      body: "",
      price: "",
      title: "My post title",
    });

    expect(content).toMatchObject({
      type: "link",
      previewTitle: undefined,
    });
  });

  test("previews downloadable file attachments as generic asset cards", () => {
    const onDownload = () => undefined;
    const content = buildPostComposerPreviewContent({
      access: "free",
      attachment: { kind: "file", label: "export.csv" },
      body: "A deterministic downloadable file.",
      fileAsset: {
        mimeType: "text/csv",
        onDownload,
        sizeBytes: 18,
      },
      price: "",
      title: "Research export",
    });

    expect(content).toMatchObject({
      type: "generic_asset",
      assetKind: "download_file",
      title: "Research export",
      filename: "export.csv",
      mimeType: "text/csv",
      sizeBytes: 18,
      accessMode: "public",
      hasEntitlement: true,
      onDownload,
      priceLabel: undefined,
      onBuy: undefined,
    });
  });

  test("previews file attachments from the buyer perspective when paid", () => {
    const content = buildPostComposerPreviewContent({
      access: "paid",
      attachment: { kind: "file", label: "dataset.json" },
      body: "",
      fileAsset: {
        mimeType: "application/json",
        onDownload: () => undefined,
        sizeBytes: 1024,
      },
      price: "2.50",
      title: "Locked dataset",
    });

    expect(content).toMatchObject({
      type: "generic_asset",
      accessMode: "locked",
      listingMode: "listed",
      listingStatus: "active",
      priceLabel: "$2.50",
      hasEntitlement: false,
      onDownload: undefined,
    });
    expect(content.type === "generic_asset" && typeof content.onBuy === "function").toBe(true);
  });

  test("falls back to the attachment label when a file post has no title", () => {
    const content = buildPostComposerPreviewContent({
      access: "free",
      attachment: { kind: "file", label: "notes.txt" },
      body: "",
      price: "",
      title: "",
    });

    expect(content).toMatchObject({
      type: "generic_asset",
      title: "notes.txt",
      filename: "notes.txt",
      mimeType: null,
      sizeBytes: null,
      onDownload: undefined,
    });
  });
});
