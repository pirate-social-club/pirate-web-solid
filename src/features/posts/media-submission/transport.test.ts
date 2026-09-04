import { describe, expect, test } from "bun:test";

import { createPersistedMediaCommand } from "./pending";
import {
  AmbiguousMediaSubmissionError,
  createSameOriginMediaSubmissionTransport,
} from "./transport";

const uploadReservation = {
  reservation_id: "reservation-1",
  track: "song",
  slot: "primary_audio",
  status: "awaiting_upload",
  upload: {
    method: "PUT",
    url: "https://uploads.example/song",
    required_headers: [{ name: "content-type", value: "audio/mpeg" }],
    expires_at: "2026-08-27T00:00:00Z",
  },
} as const;

describe("same-origin media submission transport", () => {
  test("sends session credentials and current CSRF state through the Worker API proxy", async () => {
    const seen: Array<{ url: string; credentials?: RequestCredentials; csrf: string | null }> = [];
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      seen.push({ url: input.toString(), credentials: init?.credentials, csrf: headers.get("x-csrf-token") });
      return new Response(JSON.stringify({
        reservation_id: "reservation-1",
        track: "song",
        slot: "primary_audio",
        status: "awaiting_upload",
        upload: { method: "PUT", url: "https://uploads.example/song", required_headers: [], expires_at: "2026-08-27T00:00:00Z" },
      }), { status: 201, headers: { "content-type": "application/json" } });
    };
    const command = await createPersistedMediaCommand({
      kind: "reserve",
      idempotencyKey: "reserve-key",
      sameOriginPath: "/api/communities/community-1/media-upload-reservations",
      body: {
        persona_id: "persona-1",
        idempotency_key: "reserve-key",
        track: "song",
        slot: "primary_audio",
        file: { name: "song.mp3", content_type: "audio/mpeg", size_bytes: 3 },
      },
    });
    const transport = createSameOriginMediaSubmissionTransport({
      origin: "https://solid.example",
      fetchImpl,
      csrfToken: () => "csrf-current",
    });

    await transport.dispatch(command);

    expect(seen).toEqual([{
      url: "https://solid.example/api/communities/community-1/media-upload-reservations",
      credentials: "same-origin",
      csrf: "csrf-current",
    }]);
  });

  test("keeps opaque upload credentials out and forwards only required headers", async () => {
    let seenUrl: string | undefined;
    let seen: RequestInit | undefined;
    const transport = createSameOriginMediaSubmissionTransport({
      origin: "https://solid.example",
      fetchImpl: async (input, init) => {
        seenUrl = input.toString();
        seen = init;
        return new Response(null, { status: 200 });
      },
      csrfToken: () => "csrf-current",
    });

    await transport.upload(uploadReservation,
      new Blob([new Uint8Array([1, 2, 3])], { type: "audio/mpeg" }));

    expect(seenUrl).toBe("https://uploads.example/song");
    expect(seen?.credentials).toBe("omit");
    expect(new Headers(seen?.headers).get("content-type")).toBe("audio/mpeg");
    expect(new Headers(seen?.headers).has("x-csrf-token")).toBe(false);
  });

  test("keeps browser and CORS-like upload failures ambiguous for retry", async () => {
    const transport = createSameOriginMediaSubmissionTransport({
      origin: "https://solid.example",
      fetchImpl: async () => {
        throw new TypeError("Failed to fetch");
      },
      csrfToken: () => "csrf-current",
    });

    await expect(transport.upload(uploadReservation,
      new Blob([new Uint8Array([1, 2, 3])], { type: "audio/mpeg" })))
      .rejects.toBeInstanceOf(AmbiguousMediaSubmissionError);
  });

  test("keeps a non-successful R2 response ambiguous for retry", async () => {
    const transport = createSameOriginMediaSubmissionTransport({
      origin: "https://solid.example",
      fetchImpl: async () => new Response(null, { status: 503 }),
      csrfToken: () => "csrf-current",
    });

    await expect(transport.upload(uploadReservation,
      new Blob([new Uint8Array([1, 2, 3])], { type: "audio/mpeg" })))
      .rejects.toBeInstanceOf(AmbiguousMediaSubmissionError);
  });

  test("refuses a video snapshot at the retained song-only transport boundary", async () => {
    // SAFETY: this test exercises only the read command, so the partial API
    // double supplies the sole generated-client method the transport invokes.
    const transport = createSameOriginMediaSubmissionTransport({
      api: {
        get_mediaPostSubmissionsSubmissionId: async () => ({
          submission_id: "submission-video",
          author_persona: {
            persona_id: "persona-1",
            object: "persona",
            display_name: null,
            avatar_ref: null,
            primary_public_handle: null,
          },
          href: "/media-post-submissions/submission-video",
          track: "video",
          intent: "original_audio",
          creation_revision: 1,
          video_revision: 1,
          caption: null,
          updated_at: "2026-09-04T12:00:00.000Z",
          status: "processing",
          phase: "analysis",
        }),
      } as never,
      csrfToken: () => "csrf-current",
    });

    await expect(transport.read("submission-video"))
      .rejects.toBeInstanceOf(AmbiguousMediaSubmissionError);
  });
});
