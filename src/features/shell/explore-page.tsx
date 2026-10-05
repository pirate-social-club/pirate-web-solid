import { Title } from "@solidjs/meta";
import { Type } from "../../design-system";

/** Public discovery has no API contract yet; never substitute account memberships. */
export function ExplorePage() {
  return <main class="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8" data-route-path="/explore">
    <Title>Explore</Title>
    <Type as="h1" variant="h1">Explore</Type>
    <Type>Community discovery is not available yet.</Type>
    <a class="self-start rounded-lg px-3 py-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/">For You</a>
  </main>;
}
