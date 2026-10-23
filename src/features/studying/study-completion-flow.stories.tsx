import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { createSessionApiClient } from "../../api/client.ts";
import { completionFixture, progressFixture } from "../activity/activity-contract-fixtures.ts";
import { StudyCompletionFlow } from "./study-completion-flow.tsx";

const meta = {
  title: "Flows/Studying/Completion",
  parameters: { layout: "fullscreen", docs: { description: { component: "The production completion flow: results first, then a separately confirmed earned song streak. Reads use generated-client fixtures; no microphone or network." } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

let progressRead = false;
function CompletionExample() {
  progressRead = false;
  const signalId = `story-earned-${crypto.randomUUID()}`;
  const client = createSessionApiClient({ origin: location.origin, fetchImpl: async input => {
    if (String(input).endsWith("/completion")) return Response.json({ ...completionFixture, decision: {
      ...completionFixture.decision, earned_day: { status: "recorded", signal_id: signalId, song_day_newly_earned: true, community_day_newly_earned: true },
    } });
    progressRead = true;
    return Response.json(progressFixture);
  } });
  return <StudyCompletionFlow communityId="community" postId="song" personaId="public-profile" ownerAccountId="story-account"
    attempt={{ kind: "study", session_id: "study-session" }} result={{ kind: "complete", correctCount: 6, totalCount: 7, scorePercent: 86 }}
    dependencies={{ completionClient: client, progressClient: client,
      resolveSession: async () => ({ status: "authenticated", userId: "story-account", personas: [] }),
      resolveFreshSession: async () => ({ status: "authenticated", userId: "story-account", personas: [] }),
    }}
    onExit={() => {}} onStudyAgain={() => {}} />;
}
export const Results: Story = { render: () => <CompletionExample /> };
export const ResultsMobile: Story = { ...Results, globals: { viewport: { value: "mobile1", isRotated: false } } };
export const EarnedStreak: Story = {
  ...Results,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("86%")).toBeInTheDocument();
    await expect(canvas.queryByText("Qualification")).not.toBeInTheDocument();
    await waitFor(() => expect(progressRead).toBe(true));
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(canvas.getByText("day streak")).toBeInTheDocument());
    await expect(canvas.queryByText("86%")).not.toBeInTheDocument();
    await expect(canvas.getByLabelText("Current week")).toBeInTheDocument();
  },
};
export const EarnedStreakMobile: Story = { ...EarnedStreak, globals: { viewport: { value: "mobile1", isRotated: false } } };
