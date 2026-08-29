/** @jsxImportSource @solidjs/web */
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { Card, CardContent, Type } from "../../../design-system";
import { MediaShell } from "./media-shell";

const meta = { title: "Screens/Shell/MediaShell", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function FeedPreview() {
  return (
    <main data-feed-preview class="mx-auto flex min-h-[70vh] max-w-2xl flex-col gap-4">
      <div>
        <Type as="p" variant="label" class="text-muted-foreground">For you</Type>
        <Type as="h1" variant="h1">Public feed</Type>
      </div>
      {["A harbor morning", "How we build together", "Late-night karaoke"].map((title, index) => (
        <Card>
          <CardContent class="flex min-h-48 flex-col justify-end gap-2 p-5">
            <Type as="p" variant="caption">c/pirate · {index + 1}h</Type>
            <Type as="h2" variant="h3">{title}</Type>
            <Type variant="body" class="text-muted-foreground">A small content card ready to become a richer media post.</Type>
          </CardContent>
        </Card>
      ))}
    </main>
  );
}

export const AnonymousDesktop: Story = { render: () => <MediaShell><FeedPreview /></MediaShell> };
export const AuthenticatedDesktop: Story = { render: () => <MediaShell signedIn><FeedPreview /></MediaShell> };
export const Mobile: Story = { parameters: { viewport: { defaultViewport: "mobile1" } }, render: () => <MediaShell><FeedPreview /></MediaShell> };
