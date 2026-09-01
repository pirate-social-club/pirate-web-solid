import { Match, Show, Switch, createMemo, createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { Card, Type } from "@pirate/web-solid-ui";
import { CommunityArchivePage } from "../archive-page/community-archive-page";
import { CommunityLinksEditorPage, createEmptyCommunityLinkEditorItem, type CommunityLinkEditorItem } from "../links-editor/community-links-editor-page";
import { CommunityRulesEditorPage, type RuleDraft } from "../rules-editor/community-rules-editor-page";
import { CommunityNamespaceSettingsPanel } from "./community-namespace-settings-panel";
import { CommunityNamesSettingsPanel } from "./community-names-settings-panel";
import { NAMES_ACTIVE, NAMES_PAUSED } from "./community-names-settings-fixtures";
import { CommunityModerationPolicyPanel, CommunityModerationQueuePanel } from "./community-moderation-settings-panel";
import { HIDDEN_MODERATION_CASE_DETAILS, HIDDEN_MODERATION_CASES, MODERATION_POLICY, MODERATION_VIEW_AND_ACT, OPEN_MODERATION_CASE_DETAILS, OPEN_MODERATION_CASES } from "./community-moderation-settings-fixtures";
import { CommunityOwnerSettingsShell } from "./community-owner-settings-shell";
import { CommunityProfileSettingsPanel } from "./community-profile-settings-panel";
import { createFakeProfileSettingsPort, namespaceIdempotencyKeys, namespaceState } from "./fake-owner-settings-port";
import { moderationPolicyDecisions, type CommunityModerationCaseView, type CommunityModerationPolicyDecision } from "./community-moderation-settings-model";
import type {
  CommunityProfileDraft,
  OwnerSettingsAccess,
  OwnerSettingsSection,
} from "./owner-settings-model";

const FULL_ACCESS: OwnerSettingsAccess = {
  "community.profile.write": true,
  "community.namespace.write": true,
  "community.names.manage": true,
  "community.rules.write": true,
  "community.links.write": true,
  "community.moderation.manage": true,
  "community.archive.write": true,
};

const NO_ACCESS: OwnerSettingsAccess = {
  "community.profile.write": false,
  "community.namespace.write": false,
  "community.names.manage": false,
  "community.rules.write": false,
  "community.links.write": false,
  "community.moderation.manage": false,
  "community.archive.write": false,
};

const INITIAL_PROFILE: CommunityProfileDraft = {
  avatar_url: null,
  cover_url: null,
  description: "A home for independent musicians, listeners and open-web builders.",
  display_name: "Midnight Waves",
};

const INITIAL_RULES: RuleDraft[] = [
  { id: "rule-1", existingRuleId: "rule-1", title: "Be constructive", body: "Critique the work, never the person.", reportReason: "Unconstructive conduct" },
  { id: "rule-2", existingRuleId: "rule-2", title: "No spam", body: "Share work with context and participate beyond promotion.", reportReason: "Spam" },
];

const INITIAL_LINKS: CommunityLinkEditorItem[] = [
  { id: "link-1", label: "Website", platform: "official_website", url: "https://midnight.example" },
  { id: "link-2", label: "Bandcamp", platform: "bandcamp", url: "https://midnight.example/music" },
];

function PlaceholderPanel(props: { body: string; title: string }) {
  return <Card class="p-6"><Type as="h2" variant="h2">{props.title}</Type><Type as="p" class="mt-2 text-muted-foreground" variant="body">{props.body}</Type></Card>;
}

function OwnerSettingsHappyPath(props: { access?: OwnerSettingsAccess; initialSection?: OwnerSettingsSection }) {
  const profilePort = createFakeProfileSettingsPort(INITIAL_PROFILE);
  const [active, setActive] = createSignal<OwnerSettingsSection>(props.initialSection ?? "namespace");
  const [profile, setProfile] = createSignal(INITIAL_PROFILE);
  const [savedProfile, setSavedProfile] = createSignal(INITIAL_PROFILE);
  const [profileRevision, setProfileRevision] = createSignal(7);
  const [profileSaving, setProfileSaving] = createSignal(false);
  const [rules, setRules] = createSignal(INITIAL_RULES);
  const [links, setLinks] = createSignal(INITIAL_LINKS);
  const [archiveStatus, setArchiveStatus] = createSignal<"active" | "archived">("active");
  const [namesSnapshot, setNamesSnapshot] = createSignal(NAMES_ACTIVE);
  const [caseView, setCaseView] = createSignal<CommunityModerationCaseView>("open");
  const [policyDecisions, setPolicyDecisions] = createSignal(moderationPolicyDecisions(MODERATION_POLICY));
  const [policyDirty, setPolicyDirty] = createSignal(false);
  const [savedMessage, setSavedMessage] = createSignal("");
  const dirtySections = createMemo<ReadonlyArray<OwnerSettingsSection>>(() => {
    const dirty: OwnerSettingsSection[] = [];
    if (JSON.stringify(profile()) !== JSON.stringify(savedProfile())) dirty.push("profile");
    if (policyDirty()) dirty.push("content_policy");
    return dirty;
  });

  const saveProfile = async () => {
    setProfileSaving(true);
    try {
      const result = await profilePort.save({
        expected_revision: profileRevision(),
        idempotency_key: "storybook-profile-save",
        profile: profile(),
      });
      setProfileRevision(result.revision);
      setSavedProfile(result.profile);
      setSavedMessage("Profile saved");
    } finally {
      setProfileSaving(false);
    }
  };
  return (
    <CommunityOwnerSettingsShell
      access={props.access ?? FULL_ACCESS}
      activeSection={active()}
      communityName={profile().display_name}
      dirtySections={dirtySections()}
      onSectionChange={setActive}
    >
      <Switch>
        <Match when={active() === "profile"}>
          <CommunityProfileSettingsPanel
            draft={profile()}
            onAvatarChange={(file) => setProfile((current) => ({
              ...current,
              avatar_url: file ? URL.createObjectURL(file) : null,
            }))}
            onChange={setProfile}
            onCoverChange={(file) => setProfile((current) => ({
              ...current,
              cover_url: file ? URL.createObjectURL(file) : null,
            }))}
            onSave={saveProfile}
            saveDisabled={!dirtySections().includes("profile")}
            saveLoading={profileSaving()}
            showHeading={false}
          />
        </Match>
        <Match when={active() === "namespace"}>
          <CommunityNamespaceSettingsPanel
            draftRootLabel="midnight"
            idempotencyKeys={namespaceIdempotencyKeys("storybook-connected")}
            onCommand={() => undefined}
            onDraftRootLabelChange={() => undefined}
            showHeading={false}
            snapshot={namespaceState({
              kind: "verified",
              canonical_route: "https://app.midnight/",
              canonical_route_label: "app.midnight",
              fallback_route: "https://pirate.sc/c/midnight",
              fallback_route_label: "pirate.sc/c/midnight",
            })}
          />
        </Match>
        <Match when={active() === "names"}>
          <CommunityNamesSettingsPanel
            onCommand={(command) => {
              setNamesSnapshot(command.kind === "pause_names" ? NAMES_PAUSED : NAMES_ACTIVE);
              setSavedMessage(`Names action: ${command.kind}`);
            }}
            onReviewAddress={() => setActive("namespace")}
            showHeading={false}
            snapshot={namesSnapshot()}
          />
        </Match>
        <Match when={active() === "rules"}><CommunityRulesEditorPage rules={rules()} onRulesChange={setRules} onSave={() => setSavedMessage("Rules saved")} showHeading={false} /></Match>
        <Match when={active() === "links"}>
          <CommunityLinksEditorPage
            links={links()}
            onAddLink={() => setLinks((current) => [...current, createEmptyCommunityLinkEditorItem(current.map((link) => link.id))])}
            onLinkChange={(id, patch) => setLinks((current) => current.map((link) => link.id === id ? { ...link, ...patch } : link))}
            onRemoveLink={(id) => setLinks((current) => current.filter((link) => link.id !== id))}
            onSave={() => setSavedMessage("Links saved")}
            showHeading={false}
          />
        </Match>
        <Match when={active() === "moderation_queue"}>
          <CommunityModerationQueuePanel
            capabilities={MODERATION_VIEW_AND_ACT}
            caseActionIdempotencyKey={(caseRef) => `storybook-shell-action-${caseRef}`}
            cases={caseView() === "hidden" ? HIDDEN_MODERATION_CASES : OPEN_MODERATION_CASES}
            caseView={caseView()}
            details={caseView() === "hidden" ? HIDDEN_MODERATION_CASE_DETAILS : OPEN_MODERATION_CASE_DETAILS}
            onCaseAction={(input) => setSavedMessage(`Moderation action: ${input.body.action}`)}
            onCaseViewChange={setCaseView}
            showHeading={false}
          />
        </Match>
        <Match when={active() === "content_policy"}>
          <CommunityModerationPolicyPanel
            capabilities={MODERATION_VIEW_AND_ACT}
            onPolicyDecisionChange={(category, decision: CommunityModerationPolicyDecision) => {
              setPolicyDecisions((current) => ({ ...current, [category]: decision }));
              setPolicyDirty(true);
            }}
            onPolicySave={() => { setPolicyDirty(false); setSavedMessage("Moderation policy saved"); }}
            policy={MODERATION_POLICY}
            policyDecisions={policyDecisions()}
            policyDirty={policyDirty()}
            showHeading={false}
          />
        </Match>
        <Match when={active() === "archive"}><CommunityArchivePage onArchive={() => setArchiveStatus("archived")} onUnarchive={() => setArchiveStatus("active")} showHeading={false} status={archiveStatus()} submitState={{ kind: "idle" }} /></Match>
      </Switch>
      <Show when={savedMessage()}><Type aria-live="polite" class="sr-only" variant="caption">{savedMessage()}</Type></Show>
    </CommunityOwnerSettingsShell>
  );
}

const meta = {
  title: "Screens/Community/OwnerSettings/Shell",
  component: CommunityOwnerSettingsShell,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof CommunityOwnerSettingsShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ConnectedNamespace: Story = {
  args: { access: FULL_ACCESS, activeSection: "namespace", children: null, communityName: "Midnight Waves", onSectionChange: () => undefined },
  render: () => <OwnerSettingsHappyPath />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Community address" })).toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: "app.midnight" })).toBeInTheDocument();
    await expect(canvas.getByText("Connected")).toBeInTheDocument();
  },
};

export const ProfileDefault: Story = {
  args: { access: FULL_ACCESS, activeSection: "profile", children: null, communityName: "Midnight Waves", onSectionChange: () => undefined },
  render: () => <OwnerSettingsHappyPath initialSection="profile" />,
};

export const ProfileDirtySave: Story = {
  args: { access: FULL_ACCESS, activeSection: "profile", children: null, communityName: "Midnight Waves", onSectionChange: () => undefined },
  render: () => <OwnerSettingsHappyPath initialSection="profile" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const name = canvas.getByRole("textbox", { name: "Community name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Midnight Signals");
    await expect(canvas.getByRole("button", { name: /Profile.*Unsaved/ })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(await canvas.findByText("Profile saved")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /Profile.*Unsaved/ })).not.toBeInTheDocument();
  },
};

export const ExistingPanelsMounted: Story = {
  args: { access: FULL_ACCESS, activeSection: "namespace", children: null, communityName: "Midnight Waves", onSectionChange: () => undefined },
  render: () => <OwnerSettingsHappyPath />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Rules/ }));
    await expect(canvas.getByRole("heading", { name: "Rules" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: /Links/ }));
    await expect(canvas.getByRole("heading", { name: "Links" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: /Names/ }));
    await expect(canvas.getByRole("heading", { name: "Community names" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: /Archive/ }));
    await expect(canvas.getByRole("heading", { name: "Archive community" })).toBeInTheDocument();
  },
};

export const ModerationQueueMounted: Story = {
  args: { access: FULL_ACCESS, activeSection: "moderation_queue", children: null, communityName: "Midnight Waves", onSectionChange: () => undefined },
  render: () => <OwnerSettingsHappyPath initialSection="moderation_queue" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Taken down" }));
    await expect(canvas.getByRole("button", { name: "Restore" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Needs review" }));
    await expect(canvas.getByRole("button", { name: "Publish" })).toBeInTheDocument();
  },
};

export const ContentPolicyMounted: Story = {
  args: { access: FULL_ACCESS, activeSection: "content_policy", children: null, communityName: "Midnight Waves", onSectionChange: () => undefined },
  render: () => <OwnerSettingsHappyPath initialSection="content_policy" />,
};

export const CapabilityGated: Story = {
  args: { access: { ...FULL_ACCESS, "community.names.manage": false, "community.moderation.manage": false }, activeSection: "profile", children: <PlaceholderPanel body="Only permitted sections are shown." title="Profile" />, communityName: "Midnight Waves", onSectionChange: () => undefined },
  render: () => <OwnerSettingsHappyPath access={{ ...FULL_ACCESS, "community.names.manage": false, "community.moderation.manage": false }} initialSection="profile" />,
};

export const Loading: Story = {
  args: { access: FULL_ACCESS, activeSection: "profile", children: null, communityName: "Midnight Waves", onSectionChange: () => undefined, status: "loading" },
};

export const Error: Story = {
  args: { access: FULL_ACCESS, activeSection: "profile", children: null, communityName: "Midnight Waves", errorMessage: "The settings revision could not be read.", onRetry: () => undefined, onSectionChange: () => undefined, status: "error" },
};

export const NoCapabilities: Story = {
  args: { access: NO_ACCESS, activeSection: "profile", children: null, communityName: "Midnight Waves", onSectionChange: () => undefined },
};
