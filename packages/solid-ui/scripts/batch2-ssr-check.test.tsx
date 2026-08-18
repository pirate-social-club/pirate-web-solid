import { renderToString } from "@solidjs/web";
import { describe, expect, it } from "vitest";

import { Chip } from "@/components/actions/chip/chip";
import { MediaControlButton } from "@/components/media/media-control-button/media-control-button";
import { PillButton } from "@/components/actions/pill-button/pill-button";
import { Avatar } from "@/components/data-display/avatar/avatar";
import { BadgedCircle } from "@/components/data-display/badged-circle/badged-circle";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/disclosure/tabs/tabs";
import { IconPlay } from "@/components/media/icons";
import { Scrubber } from "@/components/media/scrubber/scrubber";
import { Waveform } from "@/components/media/waveform/waveform";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/overlays/sheet/sheet";
import { CommentPill } from "@/patterns/engagement/comment-pill/comment-pill";
import { CommunityAvatar } from "@/patterns/engagement/community-avatar/community-avatar";
import { VotePill } from "@/patterns/engagement/vote-pill/vote-pill";

function renderHtml(ui: () => unknown): string {
  return renderToString(() => <>{ui()}</>);
}

describe("Batch 2 SSR smoke", () => {
  it("renders Avatar without browser APIs", () => {
    expect(
      renderHtml(() => <Avatar fallback="Jane Doe" />),
    ).toContain("JD");
  });

  it("renders BadgedCircle without browser APIs", () => {
    expect(
      renderHtml(() => (
        <BadgedCircle badge={<span>badge</span>} badgeLabel="Verified" badgeSize={18}>
          <span>subject</span>
        </BadgedCircle>
      )),
    ).toContain("Verified");
  });

  it("renders Chip without browser APIs", () => {
    expect(renderHtml(() => <Chip>Genre</Chip>)).toContain("Genre");
  });

  it("renders PillButton without browser APIs", () => {
    expect(renderHtml(() => <PillButton>Best</PillButton>)).toContain("Best");
  });

  it("renders MediaControlButton without browser APIs", () => {
    expect(
      renderHtml(() => (
        <MediaControlButton aria-label="Play">
          <IconPlay class="size-5" />
        </MediaControlButton>
      )),
    ).toContain('aria-label="Play"');
  });

  it("renders Scrubber without browser APIs", () => {
    expect(
      renderHtml(() => <Scrubber ariaLabel="Playback position" value={32} />),
    ).toContain('aria-label="Playback position"');
  });

  it("renders Waveform without browser APIs", () => {
    expect(renderHtml(() => <Waveform seed="midnight-waves" count={8} />).length).toBeGreaterThan(0);
  });

  it("renders Tabs without browser APIs", () => {
    expect(
      renderHtml(() => (
        <Tabs defaultValue="account">
          <TabsList>
            <TabsTrigger value="account">Account</TabsTrigger>
          </TabsList>
          <TabsContent value="account">
            <p>Account content</p>
          </TabsContent>
        </Tabs>
      )),
    ).toContain("Account");
  });

  it("renders a closed Sheet without browser APIs", () => {
    expect(
      renderHtml(() => (
        <Sheet>
          <SheetTrigger>Open sheet</SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Confirm purchase</SheetTitle>
            </SheetHeader>
          </SheetContent>
        </Sheet>
      )),
    ).toContain("Open sheet");
  });

  it("renders CommunityAvatar without browser APIs", () => {
    expect(
      renderHtml(() => (
        <CommunityAvatar communityId="cmt_atlas" displayName="Atlas Gardens" />
      )),
    ).toContain('alt="Atlas Gardens"');
  });

  it("renders VotePill without browser APIs", () => {
    expect(renderHtml(() => <VotePill score={18} />)).toContain("18");
  });

  it("renders CommentPill without browser APIs", () => {
    expect(renderHtml(() => <CommentPill count={24} />)).toContain("Comments (24)");
  });
});
