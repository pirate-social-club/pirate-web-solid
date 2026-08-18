import { isServer } from "@solidjs/web";
import { createEffect, type Accessor, type Setter } from "solid-js";
import { createMediaQuery } from "./media-query";

export function createPublicVideoFeedPlayback(options: {
  feed: Accessor<HTMLDivElement | undefined>;
  activeId: Accessor<string | null>;
  setActiveId: Setter<string | null>;
}) {
  const reducedMotion = createMediaQuery("(prefers-reduced-motion: reduce)");
  const cards = new Map<string, HTMLElement>();
  const videos = new Map<string, HTMLVideoElement>();
  let observer: IntersectionObserver | undefined;

  function registerCard(id: string, element: HTMLElement): void {
    cards.set(id, element);
    observer?.observe(element);
  }

  function registerVideo(id: string, element: HTMLVideoElement): void {
    videos.set(id, element);
    element.addEventListener("play", () => { element.dataset.playbackState = "playing"; });
    element.addEventListener("pause", () => { element.dataset.playbackState = "paused"; });
  }

  function pauseAllExcept(id: string | null): void {
    for (const [videoId, video] of videos) {
      if (videoId !== id) {
        video.pause();
        video.dataset.playbackState = "paused";
      }
    }
  }

  createEffect(
    () => ({ id: options.activeId(), reducedMotion: reducedMotion() }),
    ({ id, reducedMotion: motionReduced }) => {
      options.feed()?.setAttribute("data-active-video", id ?? "none");
      pauseAllExcept(id);
      const video = id ? videos.get(id) : undefined;
      if (!video || motionReduced) return;
      void video.play().then(() => {
        video.dataset.playbackState = "playing";
      }).catch(() => {
        video.dataset.playbackState = "autoplay-blocked";
      });
    },
  );

  createEffect(
    () => isServer,
    server => {
      if (server) return;
      observer = new IntersectionObserver(entries => {
        const candidate = entries
          .filter(entry => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const id = candidate?.target.getAttribute("data-feed-item-id");
        if (id && (candidate?.intersectionRatio ?? 0) >= 0.5) options.setActiveId(id);
      }, { threshold: [0.5, 0.75, 1] });
      for (const card of cards.values()) observer.observe(card);
      return () => {
        observer?.disconnect();
        observer = undefined;
      };
    },
  );

  return { reducedMotion, cards, videos, registerCard, registerVideo };
}
