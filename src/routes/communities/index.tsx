import { Title } from "@solidjs/meta";

import { Card, CardContent, Type } from "../../design-system";
import { MediaShell } from "../../features/shell/media-shell/media-shell";

/** Reserve /communities for discovery until account membership listing exists. */
export default function CommunitiesRoute() {
  return (
    <MediaShell activeItemId="communities">
      <main class="mx-auto w-full max-w-2xl" data-route-path="/communities">
        <Title>Communities · Pirate</Title>
        <Card>
          <CardContent class="space-y-4 p-6">
            <Type as="h1" variant="h2">Communities</Type>
            <Type as="p" class="text-muted-foreground" variant="body">
              Start a community and invite people around a shared interest.
            </Type>
            <a
              class="inline-flex h-11 items-center justify-center rounded-[var(--radius-md)] bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              href="/communities/new"
            >
              Create community
            </a>
          </CardContent>
        </Card>
      </main>
    </MediaShell>
  );
}
