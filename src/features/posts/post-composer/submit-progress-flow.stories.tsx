import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { Type } from "../../../design-system";
import { PostComposer } from "./post-composer";
import {
  createSubmitProgressReporter,
  simpleSubmitProgressSteps,
  songSubmitProgressSteps,
  videoSubmitProgressSteps,
} from "./submit-progress";
import { baseComposer } from "./story-fixtures";
import { ComposerFrame } from "./story-helpers";
import type { ComposerTab, SubmitProgress } from "./types";

type Scenario = "text" | "image" | "song" | "video";

function stepsForScenario(scenario: Scenario) {
  if (scenario === "song") {
    return songSubmitProgressSteps({ hasPendingBundle: false, hasExtraArtifacts: true, isLocked: false });
  }
  if (scenario === "video") return videoSubmitProgressSteps({ monetized: true });
  return simpleSubmitProgressSteps({ mode: scenario, hasMedia: scenario === "image" });
}

function progressForScenario(scenario: Scenario): SubmitProgress {
  const steps = stepsForScenario(scenario);
  let progress: SubmitProgress | undefined;
  const reporter = createSubmitProgressReporter(steps, (next) => {
    progress = next;
  });
  const step = steps.find(({ phase }) => phase !== "validating" && phase !== "done") ?? steps[0]!;
  reporter(step.key, step.phase === "uploading_media" ? "62%" : undefined);
  return progress!;
}

function FlowDemo(props: { scenario: Scenario }) {
  const current = () => progressForScenario(props.scenario);

  const mode = (): ComposerTab => props.scenario;
  return (
    <ComposerFrame>
      <ShowProgress progress={current()} mode={mode()} />
    </ComposerFrame>
  );
}

function ShowProgress(props: { progress: SubmitProgress | null; mode: ComposerTab }) {
  if (props.progress?.phase === "done") {
    return <Type as="p" variant="body">Post published — the app navigates to the new post.</Type>;
  }
  return (
    <PostComposer
      {...baseComposer}
      mode={props.mode}
      submit={{
        canPost: true,
        loading: props.progress !== null,
        progress: props.progress,
      }}
    />
  );
}

const meta = {
  title: "App/Posts/PostComposer/SubmitProgressFlow",
  component: FlowDemo,
  parameters: { layout: "fullscreen" },
  argTypes: {
    scenario: { control: "select", options: ["text", "image", "song", "video"] },
  },
  args: { scenario: "image" },
} satisfies Meta<typeof FlowDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Flow: Story = { name: "Flow (deterministic)" };

export const Mobile: Story = {
  ...Flow,
  name: "Mobile",
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
