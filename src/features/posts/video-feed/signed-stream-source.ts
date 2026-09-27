import type { VideoSourceAttacher } from "@pirate/web-solid-ui";

import { mintPlaybackAccess } from "../video-submission/playback-access";
import { attachPlayback } from "../video-submission/playback-engine";

export interface SignedStreamSourceDependencies {
  readonly mint?: typeof mintPlaybackAccess;
  readonly attach?: typeof attachPlayback;
  readonly now?: () => number;
}

/**
 * Signed Stream playback for one published video, attached to the feed's own
 * video element. A grant is minted when the post becomes eager, renewed before
 * it lapses (keeping position and play state), and playback stops if a grant
 * cannot be obtained or the stream fails: the element never keeps playing on
 * an expired or refused grant. Grants live only for as long as the attachment.
 */
export function signedStreamSource(
  postId: string,
  dependencies: SignedStreamSourceDependencies = {},
): VideoSourceAttacher {
  const mint = dependencies.mint ?? mintPlaybackAccess;
  const attach = dependencies.attach ?? attachPlayback;
  const now = dependencies.now ?? Date.now;
  return (video) => {
    let stopped = false;
    let controller: AbortController | undefined;
    let detach: (() => void) | undefined;
    let renewTimer: ReturnType<typeof setTimeout> | undefined;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    const clearTimers = () => { clearTimeout(renewTimer); clearTimeout(expiryTimer); };
    const release = () => {
      clearTimers();
      controller?.abort();
      controller = undefined;
      detach?.();
      detach = undefined;
    };
    const fail = () => {
      if (stopped) return;
      release();
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
    const load = async () => {
      if (stopped) return;
      // A renewal resumes where the viewer is; the first load starts at zero.
      const position = detach === undefined ? 0 : video.currentTime || 0;
      const resume = detach !== undefined && !video.paused;
      release();
      const current = new AbortController();
      controller = current;
      try {
        const grant = await mint(postId, current.signal);
        if (stopped || current.signal.aborted) return;
        const cleanup = await attach({ video, url: grant.url, position, resume, signal: current.signal, onFailure: fail });
        if (stopped || current.signal.aborted) { cleanup(); return; }
        detach = cleanup;
        expiryTimer = setTimeout(fail, Math.max(0, grant.expiresAt - now()));
        renewTimer = setTimeout(() => { void load(); }, Math.max(1, grant.renewAt - now()));
      } catch {
        if (!current.signal.aborted) fail();
      }
    };
    void load();
    return () => {
      stopped = true;
      release();
    };
  };
}
