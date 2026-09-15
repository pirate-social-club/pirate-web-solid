import { createHash } from "node:crypto";
import type { Page, Request, Response, TestInfo } from "playwright/test";

type StepStatus = "pending" | "passed" | "failed";
type AudioEvidence = Readonly<{
  readonly hostname: string;
  readonly rangeStatus: number;
  readonly contentType: string | null;
  readonly contentRange: string | null;
  readonly requestHadRange: boolean;
  readonly cspHostMatch: boolean;
}>;

export type HappyPathSongObservation = Readonly<{
  readonly lyricsRequestCount: number;
  readonly instrumentalReviewVisible: boolean;
}>;

export type HappyPathReceiptSnapshot = Readonly<{
  readonly schema: "happy-path-attempt-receipt-v1";
  readonly attempt: Readonly<{ readonly id: string; readonly number: "1" | "2"; readonly role: "owner" | "member"; readonly started_at: string }>;
  readonly staging_release_reference: string;
  readonly staging_manifest_sha256: string;
  readonly staging_manifest_observed_at: string;
  readonly resources: Readonly<{ readonly community_id: string | null; readonly song_submission_id: string | null }>;
  readonly outcome: "passed" | "failed";
  readonly steps: readonly Readonly<{ readonly name: string; readonly status: StepStatus }>[];
  readonly fixture: Readonly<{ readonly sha256: string; readonly classification: "instrumental_audio" }>;
  readonly lyrics: Readonly<{ readonly request_count: number; readonly expected_zero: true; readonly instrumental_review_visible: boolean; readonly persisted_state: "no_lyrics" | null }>;
  readonly signed_audio: Readonly<{
    readonly expected_hostname: string;
    readonly hostname: string | null;
    readonly range_status: number | null;
    readonly content_type: string | null;
    readonly content_range: string | null;
    readonly request_had_range: boolean;
    readonly csp_host_match: boolean | null;
  }>;
}>;

function sourceMatchesHost(source: string, hostname: string): boolean {
  if (source === "*") return true;
  const withoutScheme = source.replace(/^[A-Za-z][A-Za-z0-9+.-]*:\/\//u, "");
  const host = withoutScheme.split(/[/?#]/u, 1)[0]!.replace(/:\d+$/u, "").toLowerCase();
  const target = hostname.toLowerCase();
  return host === target || (host.startsWith("*.") && target.endsWith(host.slice(1)));
}

export function cspAllowsAudioHost(policy: string, hostname: string): boolean {
  const directives = policy.split(";").map(value => value.trim().split(/\s+/u));
  const directive = directives.find(parts => parts[0] === "media-src")
    ?? directives.find(parts => parts[0] === "default-src");
  return directive?.slice(1).some(source => sourceMatchesHost(source, hostname)) ?? false;
}

export function fixtureSha256(fixture: Buffer): string {
  return createHash("sha256").update(fixture).digest("hex");
}

export class HappyPathReceipt {
  private readonly attempt: Readonly<{ readonly id: string; readonly number: "1" | "2"; readonly role: "owner" | "member"; readonly started_at: string }>;
  private readonly stagingReleaseReference: string;
  private readonly stagingManifestDigest: string;
  private readonly stagingManifestObservedAt: string;
  private readonly expectedPlaybackHost: string;
  private readonly resources: { community_id: string | null; song_submission_id: string | null } = {
    community_id: null,
    song_submission_id: null,
  };
  private readonly steps = new Map<string, StepStatus>([
    ["registration", "pending"],
    ["relogin", "pending"],
    ["community", "pending"],
    ["text_post", "pending"],
    ["song", "pending"],
  ]);
  private readonly fixture: Readonly<{ readonly sha256: string; readonly classification: "instrumental_audio" }>;
  private lyricsRequestCount = 0;
  private instrumentalReviewVisible = false;
  private cspPolicies: string[] = [];
  private audio: AudioEvidence | null = null;
  private persistedLyricsState: "no_lyrics" | null = null;
  private outcome: "passed" | "failed" = "failed";

  constructor(
    attempt: Readonly<{ readonly id: string; readonly number: "1" | "2"; readonly role: "owner" | "member"; readonly started_at: string }>,
    stagingReleaseReference: string,
    stagingManifestDigest: string,
    stagingManifestObservedAt: string,
    expectedPlaybackHost: string,
    audioFixture: Buffer,
  ) {
    this.attempt = attempt;
    this.stagingReleaseReference = stagingReleaseReference;
    this.stagingManifestDigest = stagingManifestDigest;
    this.stagingManifestObservedAt = stagingManifestObservedAt;
    this.expectedPlaybackHost = expectedPlaybackHost;
    this.fixture = { sha256: fixtureSha256(audioFixture), classification: "instrumental_audio" };
  }

  beginStep(name: string): void {
    if (this.steps.has(name)) this.steps.set(name, "pending");
  }

  finishStep(name: string, status: Exclude<StepStatus, "pending">): void {
    if (this.steps.has(name)) this.steps.set(name, status);
  }

  recordSongObservation(observation: HappyPathSongObservation): void {
    this.lyricsRequestCount = observation.lyricsRequestCount;
    this.instrumentalReviewVisible = observation.instrumentalReviewVisible;
  }

  recordPersistedNoLyrics(): void {
    this.persistedLyricsState = "no_lyrics";
  }

  recordResourceId(kind: "community_id" | "song_submission_id", value: string): void {
    if (/^[A-Za-z0-9_-]{1,128}$/u.test(value)) this.resources[kind] = value;
  }

  observeRequest(request: Request): void {
    if (request.method() === "POST" && /\/media-post-submissions\/[^/]+\/lyrics$/u.test(new URL(request.url()).pathname)) {
      this.lyricsRequestCount++;
    }
  }

  observeResponse(response: Response): void {
    const headers = response.headers();
    const policy = headers["content-security-policy"] ?? headers["content-security-policy-report-only"];
    if (policy) {
      this.cspPolicies.push(policy);
      if (this.audio) this.audio = { ...this.audio, cspHostMatch: this.cspPolicies.some(item => cspAllowsAudioHost(item, this.audio!.hostname)) };
    }
    const request = response.request();
    const songPath = new URL(response.url()).pathname.match(/^\/api\/media-post-submissions\/([A-Za-z0-9_-]+)\/terms$/u);
    if (request.method() === "POST" && songPath?.[1]) this.recordResourceId("song_submission_id", songPath[1]);
    if (request.method() !== "GET") return;
    const requestHeaders = request.headers();
    const contentType = headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase() ?? null;
    const hasRange = Boolean(requestHeaders.range);
    if (request.resourceType() !== "media" && !(hasRange && contentType?.startsWith("audio/"))) return;
    const hostname = new URL(response.url()).hostname;
    const candidate: AudioEvidence = {
      hostname,
      rangeStatus: response.status(),
      contentType,
      contentRange: headers["content-range"] ?? null,
      requestHadRange: hasRange,
      cspHostMatch: this.cspPolicies.some(item => cspAllowsAudioHost(item, hostname)),
    };
    if (!this.audio || (candidate.requestHadRange && !this.audio.requestHadRange) || candidate.rangeStatus === 206) this.audio = candidate;
  }

  signedAudioEvidence(): AudioEvidence | null {
    return this.audio;
  }

  finalize(outcome: "passed" | "failed"): void {
    this.outcome = outcome;
  }

  snapshot(): HappyPathReceiptSnapshot {
    const audio = this.audio;
    return {
      schema: "happy-path-attempt-receipt-v1",
      attempt: this.attempt,
      staging_release_reference: this.stagingReleaseReference,
      staging_manifest_sha256: this.stagingManifestDigest,
      staging_manifest_observed_at: this.stagingManifestObservedAt,
      resources: this.resources,
      outcome: this.outcome,
      steps: [...this.steps].map(([name, status]) => ({ name, status })),
      fixture: this.fixture,
      lyrics: {
        request_count: this.lyricsRequestCount,
        expected_zero: true,
        instrumental_review_visible: this.instrumentalReviewVisible,
        persisted_state: this.persistedLyricsState,
      },
      signed_audio: {
        expected_hostname: this.expectedPlaybackHost,
        hostname: audio?.hostname ?? null,
        range_status: audio?.rangeStatus ?? null,
        content_type: audio?.contentType ?? null,
        content_range: audio?.contentRange ?? null,
        request_had_range: audio?.requestHadRange ?? false,
        csp_host_match: audio?.cspHostMatch ?? null,
      },
    };
  }

  async attach(testInfo: TestInfo): Promise<void> {
    await testInfo.attach("happy-path-attempt-receipt.json", {
      body: JSON.stringify(this.snapshot(), null, 2),
      contentType: "application/json",
    });
  }
}

export function observeHappyPathPage(page: Page, receipt: HappyPathReceipt): () => void {
  const requestListener = (request: Request) => receipt.observeRequest(request);
  const listener = (response: Response) => receipt.observeResponse(response);
  page.on("request", requestListener);
  page.on("response", listener);
  return () => {
    page.off("request", requestListener);
    page.off("response", listener);
  };
}
