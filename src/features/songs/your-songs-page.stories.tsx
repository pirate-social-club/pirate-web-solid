import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { Type } from "../../design-system";
import { YourSongsPage, type LibrarySong } from "./your-songs-page.tsx";

const songs: readonly LibrarySong[] = [
  { id: "harbor-lights", title: "Harbor Lights", artist: "Night Shift", studyPath: "/p/harbor-lights/study", karaokePath: "/p/harbor-lights/karaoke", activities: ["study", "karaoke"] },
  { id: "open-water", title: "Open Water", artist: "Studio", studyPath: "/p/open-water/study", karaokePath: "/p/open-water/karaoke" },
  { id: "after-the-rain", title: "After the Rain", artist: "Harbor", studyPath: "/p/after-the-rain/study", activities: ["dance"] },
];
const meta = { title: "Screens/Songs/YourSongs", component: YourSongsPage, args: { songs, navigate: () => {} }, parameters: { layout: "fullscreen", a11y: { test: "error" }, docs: { description: { component: "Production renders `NotYetAvailable` until the api-next song-library read is released (task `api-persona-song-library`). The populated stories show the library once that read is vendored; they use fixture songs and are not live data." } } } } satisfies Meta<typeof YourSongsPage>;
export default meta;
type Story = StoryObj<typeof meta>;
/** What production renders today: the song-history read has not been released. */
export const NotYetAvailable: Story = {
  render: () => <YourSongsPage songs={[]} state="not-yet-available" navigate={() => {}} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Song history is coming soon" })).toBeInTheDocument();
    await expect(canvas.queryByRole("heading", { name: "Trending songs" })).not.toBeInTheDocument();
  },
};
export const NotYetAvailableMobile: Story = { ...NotYetAvailable, globals: { viewport: { value: "mobile1", isRotated: false } } };
export const Desktop: Story = { render: () => <YourSongsPage songs={songs} navigate={() => {}} /> };
export const Mobile: Story = { globals: { viewport: { value: "mobile1", isRotated: false } }, render: () => <YourSongsPage songs={songs} navigate={() => {}} /> };
export const Empty: Story = { render: () => <YourSongsPage songs={[]} navigate={() => {}} /> };
export const Unavailable: Story = { render: () => <YourSongsPage songs={[]} state="unavailable" navigate={() => {}} /> };
export const SignedOut: Story = { render: () => <YourSongsPage songs={[]} state="signed-out" navigate={() => {}} onSignIn={() => {}} /> };
export const SongActions: Story = {
  render: () => {
    const [path, setPath] = createSignal("");
    return <><YourSongsPage songs={songs} navigate={setPath} /><Type role="status">{path()}</Type></>;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("textbox", { name: "Find a song" }), "Harbor Lights");
    await userEvent.click(canvas.getByRole("button", { name: "Study" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("/p/harbor-lights/study");
    await userEvent.click(canvas.getByRole("button", { name: "Karaoke" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("/p/harbor-lights/karaoke");
  },
};

export const WithTrending: Story = { render: () => <YourSongsPage songs={songs} trending={[{ id: "new-tide", title: "New Tide", artist: "Harbor", studyPath: "/p/new-tide/study", karaokePath: "/p/new-tide/karaoke" }]} navigate={() => {}} /> };
export const MobileWithTrending: Story = { ...WithTrending, globals: { viewport: { value: "mobile1", isRotated: false } } };
export const TrendingUnavailable: Story = { render: () => <YourSongsPage songs={songs} trendingState="unavailable" onTrendingRetry={() => {}} navigate={() => {}} /> };
