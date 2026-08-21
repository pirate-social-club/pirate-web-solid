// Pure composer helpers ported from the React post-composer-utils.ts.

import type { ComposerStep, ComposerTab, LiveComposerState } from "./types";
import { isLiveVisibilityAllowedForAccess } from "./invariants";

// The ordered step list for a track. Text/image/link/file/live are a single
// write step; video adds details; song is the full four-step authoring flow.
export function stepsForTab(tab: ComposerTab): ComposerStep[] {
  if (tab === "song") return ["song", "lyrics", "rights", "review"];
  if (tab === "video") return ["write", "details"];
  return ["write"];
}

export function getNextComposerStep(current: ComposerStep, tab: ComposerTab): ComposerStep {
  const steps = stepsForTab(tab);
  const index = steps.indexOf(current);
  return index >= 0 && index < steps.length - 1 ? steps[index + 1]! : current;
}

export function getPreviousComposerStep(current: ComposerStep, tab: ComposerTab): ComposerStep | undefined {
  const steps = stepsForTab(tab);
  const index = steps.indexOf(current);
  return index > 0 ? steps[index - 1] : undefined;
}

export function isValidHttpUrl(value: string) {
  return normalizeHttpUrl(value) !== null;
}

export function normalizeHttpUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parse = (candidate: string) => {
    try {
      const url = new URL(candidate);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
    } catch {
      return null;
    }
  };

  const parsed = parse(trimmed);
  if (parsed) return parsed;

  if (/\s/.test(trimmed)) return null;

  const pathStart = trimmed.search(/[/?#]/);
  const authorityCandidate = pathStart === -1 ? trimmed : trimmed.slice(0, pathStart);
  const colonIndex = authorityCandidate.indexOf(":");
  if (colonIndex > 0) {
    const hostCandidate = authorityCandidate.slice(0, colonIndex).toLowerCase();
    const portLikeHost = hostCandidate.includes(".")
      || hostCandidate === "localhost"
      || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostCandidate)
      || hostCandidate.startsWith("[");
    if (!portLikeHost) return null;
  }

  const normalizedTrimmed = trimmed.toLowerCase();
  const schemelessWebUrl = trimmed.includes(".")
    || normalizedTrimmed.startsWith("localhost")
    || /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(?:[/?#]|$)/.test(trimmed)
    || /^\[[\da-f:]+\](?::\d+)?(?:[/?#]|$)/i.test(trimmed);

  if (!schemelessWebUrl) return null;

  return parse(`https://${trimmed}`);
}

export function canAdvanceComposerWriteStep({
  imageUploadPresent,
  linkUrl,
  liveState,
  mode,
  songAudioUploadPresent,
  title,
  videoUploadPresent,
  fileUploadPresent = false,
}: {
  body: string;
  imageUploadPresent: boolean;
  linkUrl: string;
  liveState?: LiveComposerState;
  mode: ComposerTab;
  songAudioUploadPresent: boolean;
  title: string;
  videoUploadPresent: boolean;
  fileUploadPresent?: boolean;
}) {
  if (mode === "song") return songAudioUploadPresent;
  if (mode === "video") return title.trim().length > 0 && videoUploadPresent;
  if (mode === "image") return title.trim().length > 0 && imageUploadPresent;
  if (mode === "link") return isValidHttpUrl(linkUrl);
  if (mode === "live") return Boolean(liveState && canSubmitLiveRoomDraft(liveState, title));
  if (mode === "file") return title.trim().length > 0 && fileUploadPresent;
  return title.trim().length > 0;
}

export function canSubmitLiveRoomDraft(liveState: LiveComposerState, title: string): boolean {
  if (!title.trim()) return false;
  if (!isLiveVisibilityAllowedForAccess(liveState)) return false;
  if (liveState.scheduleForLater && !isValidLiveScheduleAt(liveState.scheduleAt)) return false;
  if (liveState.roomKind === "duet" && !liveState.guestUserId?.trim()) return false;
  if (liveState.setlistItems.length === 0) return false;
  if (liveState.setlistItems.some((item) => !item.titleText.trim())) return false;
  if (liveState.accessMode !== "paid") return true;
  return liveState.performerAllocations.reduce((sum, allocation) => sum + allocation.sharePct, 0) === 100;
}

function isValidLiveScheduleAt(scheduleAt: string | undefined): boolean {
  const value = scheduleAt?.trim();
  if (!value) return false;
  return Number.isFinite(Date.parse(value));
}

export function normalizePriceInput(value: string) {
  const normalized = value.replace(/[^\d.]/g, "");
  const [whole, ...rest] = normalized.split(".");
  const decimals = rest.join("").slice(0, 2);
  return rest.length ? `${whole}.${decimals}` : whole;
}

export function normalizeRoyaltyInput(value: string) {
  const normalized = value.replace(/[^\d]/g, "").slice(0, 3);
  const numeric = Math.min(100, Number(normalized || 0));
  return normalized ? String(numeric) : "";
}

export function normalizeSecondsInput(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return String(Math.min(Number.parseInt(digits, 10), 86_400));
}

function formatPreviewPrice(value?: string) {
  const normalized = value?.trim();
  if (!normalized) return "$1.00";
  return normalized.startsWith("$") ? normalized : `$${normalized}`;
}
