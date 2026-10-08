import { MegapotPoolUnavailableError } from "../../api/megapot-pool-availability.ts";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
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
  render: () => <main class="mx-auto max-w-md p-4"><MegapotShareStatus communityId="community-1" postId="post-1" data={{ ...data, standing: async () => ({ pool, standing: { ...standing, share_held: false, participant_state: "entry_open" } }) }} /></main>,
};
export const Unavailable: Story = {
  render: () => <main class="mx-auto max-w-md p-4"><MegapotShareStatus communityId="community-1" postId="post-1" data={{ ...data, standing: async () => { throw new Error("offline"); } }} /></main>,
};

export const EntriesClosed: Story = {
  render: () => <main class="mx-auto max-w-md p-4"><MegapotShareStatus communityId="community-1" postId="post-1" data={{
    ...data,
    standing: async () => ({ pool: { ...pool, drawing: { ...pool.drawing!, state: "entry_closed" } }, standing: { ...standing, share_held: false, participant_state: "entry_closed" } }),
  }} /></main>,
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText(/Entries are closed/)).toBeVisible();
    await expect(canvasElement.textContent).not.toContain("processing may still be pending");
  },
};

/** A pool was seen for this song, then the provider stopped answering: the failure is reported and retryable. */
export const ServiceUnavailable: Story = {
  render: () => {
    let reads = 0;
    const pool_ = async () => { if (++reads > 1) throw new MegapotPoolUnavailableError(); return pool; };
    return <main class="mx-auto max-w-md p-4"><MegapotShareStatus communityId="community-1" postId="post-1" data={{ ...data, pool: pool_ }} /></main>;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/You have a share in drawing 42/)).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Check reward status" }));
    await expect(await canvas.findByText(/temporarily unavailable/)).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Check reward status" })).toBeEnabled();
  },
};

/** Rewards switched off: the first pool lookup is unavailable, so completion shows no rewards box at all. */
export const RewardsOffStudyComplete: Story = {
  render: () => <StudyingSurface state={{ kind: "complete", correctCount: 8, scorePercent: 80, totalCount: 10 }} lessonProgress={{ resolvedCount: 10, totalCount: 10 }}
    rewardSlot={<MegapotShareStatus communityId="community-1" postId="post-1" data={{ ...data, pool: async () => { throw new MegapotPoolUnavailableError(); } }} />} onExit={() => {}} onStudyAgain={() => {}} />,
  play: async ({ canvasElement }) => {
    await new Promise(resolve => setTimeout(resolve, 100));
    await expect(canvasElement.querySelector("[data-megapot-share]")).toBeNull();
    await expect(canvasElement.textContent).not.toContain("Megapot");
    await expect(canvasElement.textContent).not.toContain("unavailable");
  },
};
