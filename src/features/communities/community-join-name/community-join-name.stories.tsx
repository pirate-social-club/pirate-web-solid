import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { Button } from "../../../design-system";
import { ApplicationSessionProvider } from "../../shell/application-session";
import { CommunityPageShell } from "../../community/page-shell/page-shell";
import type { CommunityData } from "../../community/page-shell/page-shell-model";
import type { SupportedHnsOffering } from "../handle-storefront/handle-storefront.model";
import { CommunityJoinName, type CommunityJoinNameState } from "./community-join-name";

const community: CommunityData = {
  id: "community_preview", name: "Night Shift", handle: "app.8s28",
  description: "Music, ideas, and people building after dark.",
  membershipMode: "open", members: 1270, followers: 18400,
  posts: [{ id: "preview_post", title: "What are you working on tonight?", body: "Share something you are making.",
    authorHandle: "nightowl.8s28", score: 12, commentCount: 3, publishedAt: "2026-10-09T06:00:00Z" }],
};

/** Explicit supported staging-shaped offer, independent of Storybook's origin. */
const offering: SupportedHnsOffering = {
  offering_id: "offering_preview", offering_revision: 1, offering_hash: "offering_hash",
  community_id: "community_preview", family: "hns", namespace_root: "8s28", display_root: "8s28",
  sale_namespace_activation_id: "activation_preview", sale_namespace_activation_generation: 1,
  label_scope: { kind: "label_rule_v2", label_grammar_id: "hns_ascii_ldh_1_63_v1",
    reserved_labels_id: "reserved_preview", reserved_labels_revision: 1, reserved_labels_hash: "reserved_hash",
    availability: { kind: "length_band_v1", min_label_length: 8, max_label_length: 32 } },
  allocation: { kind: "first_come_v1" }, max_active_grants_per_account: 1,
  fulfillment: { kind: "hosted_persona_v1" },
  qualification_policy: { kind: "none_v1", policy_id: "policy_preview", policy_revision: 1, policy_hash: "policy_hash" },
  pricing: { kind: "free_v1", pricing_id: "pricing_preview", pricing_revision: 1, pricing_hash: "pricing_hash", atomic_amount: "0" },
  issuance: { family: "hns", driver_id: "hns_driver", driver_version: "1" },
  quote_ttl_seconds: 300, reservation_ttl_seconds: 900, status: "active", created_at: "2026-10-09T06:00:00Z",
};

interface PreviewProps {
  readonly initial: CommunityJoinNameState;
  readonly initialOpen: boolean;
  readonly nameOptional: boolean;
  readonly forceMobile?: boolean;
  readonly profiles: "none" | "foreign" | "here";
  readonly result: "issued" | "pending" | "failed";
}

/** API fixtures are account-private, in-memory and make no network requests. */
function createApiFixture(props: PreviewProps) {
  let joined = ["issued", "joined", "pending"].includes(props.initial.kind)
    || (props.initial.kind === "failed" && props.initial.joined);
  let failNextClaim = props.result === "failed" && props.initial.kind !== "failed";
  return {
    session: { accountId: "preview_account", profiles: props.profiles === "none" ? [] : [{
      personaId: "preview_profile", communityId: props.profiles === "foreign" ? "other_community" : community.id,
    }] },
    async prepareProfile() { return { personaId: "prepared_profile", status: "active" as const, communityId: community.id }; },
    async membership() { return { joined }; },
    async join() { joined = true; return { status: "joined" as const }; },
    async claim(label: string) {
      if (label === "membertest") return { kind: "taken" as const };
      if (failNextClaim) { failNextClaim = false; return { kind: "failed" as const }; }
      if (props.result === "pending") return { kind: "pending" as const, claimId: "claim_preview" };
      return { kind: "issued" as const, identifier: `${label}.8s28` };
    },
    async readClaim(claimId: string, label: string) {
      if (claimId !== "claim_preview") throw new Error("Unknown fixture claim");
      return { kind: "issued" as const, identifier: `${label}.8s28` };
    },
  };
}

function JourneyPreview(props: PreviewProps) {
  const api = createApiFixture(props);
  const [state, setState] = createSignal<CommunityJoinNameState>(props.initial);
  const [open, setOpen] = createSignal(props.initialOpen);
  const [joined, setJoined] = createSignal(["issued", "joined", "pending"].includes(props.initial.kind)
    || (props.initial.kind === "failed" && props.initial.joined));
  const submit = async () => {
    const previous = state();
    const base = { label: previous.label, acknowledged: previous.acknowledged };
    if (previous.kind === "submitting" || previous.kind === "pending") return;
    if (base.label !== "" && !base.acknowledged) return;
    const membership = await api.membership();
    if (!membership.joined) {
      if (!api.session.profiles.some(profile => profile.communityId === community.id)) {
        setState({ ...base, kind: "submitting", stage: "profile" });
        await api.prepareProfile();
      }
      setState({ ...base, kind: "submitting", stage: "joining" });
      await api.join();
      setJoined(true);
    }
    if (base.label === "") { setState({ ...base, kind: "joined" }); return; }
    setState({ ...base, kind: "submitting", stage: "issuing" });
    const result = await api.claim(base.label.trim().toLowerCase());
    if (result.kind === "taken") setState({ ...base, kind: "editing", issue: "taken" });
    else if (result.kind === "failed") setState({ ...base, kind: "failed", joined: true });
    else setState({ ...base, ...result });
  };
  const resume = async () => {
    const current = state();
    if (current.kind !== "pending") return;
    const result = await api.readClaim(current.claimId, current.label);
    setState({ label: current.label, acknowledged: current.acknowledged, ...result });
  };
  return <ApplicationSessionProvider state={() => ({ status: "authenticated", userId: api.session.accountId })}>
    <CommunityPageShell community={community} following={joined()} joined={joined()} onJoin={() => setOpen(true)} />
    {joined() && <div class="mx-auto max-w-3xl px-5 py-3">
      <Button variant="outline" onClick={() => {
        if (state().kind === "joined") setState({ kind: "editing", label: "", acknowledged: false });
        setOpen(true);
      }}>{state().kind === "issued" ? "My name" : state().kind === "pending" ? "Check my name" : "Choose a name"}</Button>
    </div>}
    <CommunityJoinName communityName={community.name} offering={offering} state={state()}
      forceMobile={props.forceMobile} nameOptional={props.nameOptional} joined={joined()} open={open()} onOpenChange={setOpen}
      onLabelChange={label => setState({ kind: "editing", label, acknowledged: false })}
      onAcknowledgementChange={acknowledged => setState({ ...state(), acknowledged })}
      onSubmit={() => void submit()} onResume={() => void resume()} />
  </ApplicationSessionProvider>;
}

const meta = {
  title: "Flows/Community/Join and name", component: JourneyPreview,
  args: { initial: { kind: "editing", label: "", acknowledged: false }, initialOpen: true,
    nameOptional: true, profiles: "here", result: "issued" },
  parameters: { layout: "fullscreen", a11y: { test: "error" }, docs: { description: { component:
    "Owner-directed real-component proposal. Optional naming and the revisit action await screen review. API/session/profile fixtures are explicit; this does not prove live host-local auth, profile activation or claiming." } } },
} satisfies Meta<typeof JourneyPreview>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Community: Story = { name: "1 · Community with Join", args: { initialOpen: false } };
export const NameField: Story = { name: "2 · Choose a name" };
export const Taken: Story = { name: "3 · Taken name", args: { initial: { kind: "editing", label: "membertest", acknowledged: false, issue: "taken" } } };
export const Success: Story = { name: "4 · Issued name", args: { initial: { kind: "issued", label: "nightowl", acknowledged: true, identifier: "nightowl.8s28" } },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByRole("link", { name: "Open my name" })).toHaveAttribute("href", "https://nightowl.8s28/");
  },
};
export const Valid: Story = { args: { initial: { kind: "editing", label: "nightowl", acknowledged: false } },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole("dialog", { name: "Choose your name" });
    const form = within(dialog);
    await expect(form.getByRole("button", { name: "Join" })).toBeDisabled();
    await userEvent.click(form.getByRole("checkbox"));
    await expect(form.getByRole("button", { name: "Join" })).toBeEnabled();
  },
};
export const Invalid: Story = { args: { initial: { kind: "editing", label: "short", acknowledged: false } } };
export const Submitting: Story = { args: { initial: { kind: "submitting", stage: "issuing", label: "nightowl", acknowledged: true } } };
export const PreparingFirstProfile: Story = { args: { profiles: "none", initial: { kind: "submitting", stage: "profile", label: "nightowl", acknowledged: true } } };
export const FailureBeforeJoin: Story = { args: { initial: { kind: "failed", joined: false, label: "nightowl", acknowledged: true } } };
export const JoinedButNameFailed: Story = { args: { initial: { kind: "failed", joined: true, label: "nightowl", acknowledged: true }, result: "failed" } };
export const RetryAfterJoin: Story = { ...JoinedButNameFailed,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const form = within(await body.findByRole("dialog", { name: "Choose your name" }));
    await expect(form.getByRole("alert")).toHaveTextContent("You have joined. Your name is unfinished");
    await expect(form.queryByRole("link", { name: "Open my name" })).not.toBeInTheDocument();
    await userEvent.click(form.getByRole("button", { name: "Try again" }));
    await expect(await body.findByRole("link", { name: "Open my name" })).toHaveAttribute("href", "https://nightowl.8s28/");
  },
};
export const Pending: Story = { args: { initial: { kind: "pending", claimId: "claim_preview", label: "nightowl", acknowledged: true } } };
export const ResumePending: Story = { ...Pending,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole("dialog", { name: "Choose your name" }));
    await expect(dialog.queryByRole("link", { name: "Open my name" })).not.toBeInTheDocument();
    await userEvent.click(dialog.getByRole("button", { name: "Check my name" }));
    await expect(await body.findByRole("link", { name: "Open my name" })).toHaveAttribute("href", "https://nightowl.8s28/");
  },
};
export const RevisitPending: Story = { name: "Revisit · pending claim, no automatic popup", args: { initialOpen: false,
  initial: { kind: "pending", claimId: "claim_preview", label: "nightowl", acknowledged: true } } };
export const RevisitWithoutName: Story = { name: "Revisit · joined without a name", args: { initialOpen: false,
  initial: { kind: "joined", label: "", acknowledged: false } } };
export const FirstTimeMember: Story = { args: { profiles: "none", initial: { kind: "editing", label: "nightowl", acknowledged: false } },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const form = within(await body.findByRole("dialog", { name: "Choose your name" }));
    await expect(form.queryByRole("radio")).not.toBeInTheDocument();
    await userEvent.click(form.getByRole("checkbox"));
    await userEvent.click(form.getByRole("button", { name: "Join" }));
    await expect(await body.findByRole("link", { name: "Open my name" })).toBeInTheDocument();
  },
};
export const OnlyForeignProfile: Story = { ...FirstTimeMember, args: { ...FirstTimeMember.args, profiles: "foreign" } };
export const RequiredNameProposal: Story = { name: "Decision comparison · required name", args: { nameOptional: false } };
export const MobileNameField: Story = { args: { forceMobile: true }, globals: { viewport: { value: "mobile1", isRotated: false } } };
export const MobileSuccess: Story = { ...Success, args: { ...Success.args, forceMobile: true }, globals: { viewport: { value: "mobile1", isRotated: false } } };
