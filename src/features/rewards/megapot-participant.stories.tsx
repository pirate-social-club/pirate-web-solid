import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";
import { MegapotPoolView, MegapotShareStatus } from "./megapot-participant.tsx";
import { participantPool as pool, participantStanding as standing } from "./megapot-participant.fixtures.ts";
import { StudyingSurface } from "../studying/studying-surface.tsx";
import { KaraokePracticeSurface } from "../karaoke/karaoke-practice-surface.tsx";

const meta = { title: "Parts/Rewards/Participant", parameters: { layout: "fullscreen", a11y: { test: "error" } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const data = { pool: async () => pool, standing: async () => ({ pool, standing }) };
const share = () => <MegapotShareStatus communityId="community-1" postId="post-1" data={data} />;
export const SongDetail: Story = { render: () => <main class="mx-auto max-w-xl p-4"><MegapotPoolView pool={pool} now={Date.parse("2026-10-08T12:00:00Z")} /></main> };
export const SongCard: Story = { render: () => <main class="mx-auto max-w-xl p-4"><MegapotPoolView pool={pool} compact /></main> };
export const StudyComplete: Story = {
  render: () => <StudyingSurface state={{ kind: "complete", correctCount: 8, scorePercent: 80, totalCount: 10 }} lessonProgress={{ resolvedCount: 10, totalCount: 10 }} rewardSlot={share()} onExit={() => {}} onStudyAgain={() => {}} />,
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText(/You have a share in drawing 42/)).toBeVisible(); },
};
export const KaraokeComplete: Story = {
  render: () => <KaraokePracticeSurface onStartSinging={() => {}} title="Reward song" lines={[]} singingStatus="ended" rewardSlot={share()} onExit={() => {}} />,
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText(/You have a share in drawing 42/)).toBeVisible(); },
};
export const NotYetConfirmed: Story = {
  render: () => <main class="mx-auto max-w-md p-4"><MegapotShareStatus communityId="community-1" postId="post-1" data={{ ...data, standing: async () => ({ pool, standing: { ...standing, share_held: false } }) }} /></main>,
};
export const Unavailable: Story = {
  render: () => <main class="mx-auto max-w-md p-4"><MegapotShareStatus communityId="community-1" postId="post-1" data={{ ...data, standing: async () => { throw new Error("offline"); } }} /></main>,
};
