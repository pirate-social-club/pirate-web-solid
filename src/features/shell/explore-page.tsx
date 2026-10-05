import { Title } from "@solidjs/meta";
import { Type } from "../../design-system";

/** Retained entry point for song discovery, now collected on Your Songs. */
export function ExplorePage() {
  return <main class="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8" data-route-path="/explore">
    <Title>Explore</Title>
    <Type as="h1" variant="h1">Explore</Type>
    <Type>Find songs to learn on Your Songs.</Type>
    <a class="self-start rounded-lg px-3 py-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/songs">Your Songs</a>
  </main>;
}
