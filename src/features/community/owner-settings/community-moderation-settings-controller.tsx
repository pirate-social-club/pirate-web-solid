import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import { Button, Card, FormNote, Spinner, Type } from "@pirate/web-solid-ui";
import { ApiClientError } from "@pirate/api-client-happy-path";

import {
  createCommunityModerationSettingsApi,
  type CommunityModerationCaseBundle,
  type CommunityModerationSettingsApi,
} from "./community-moderation-settings-api";
import {
  moderationPolicyDecisions,
  type CommunityModerationCapabilities,
  type CommunityModerationCaseAction,
  type CommunityModerationCaseActionInput,
  type CommunityModerationCaseView,
  type CommunityModerationPolicy,
  type CommunityModerationPolicyCategory,
  type CommunityModerationPolicyDecision,
  type CommunityModerationPolicyDecisions,
  type CommunityModerationPolicyUpdateInput,
} from "./community-moderation-settings-model";
import {
  CommunityModerationPolicyPanel,
  CommunityModerationQueuePanel,
} from "./community-moderation-settings-panel";

export type CommunityModerationSettingsSection = "moderation_queue" | "content_policy";

export interface CommunityModerationSettingsControllerProps {
  api?: CommunityModerationSettingsApi;
  communityId: string;
  section: CommunityModerationSettingsSection;
}

type LoadStatus = "loading" | "ready" | "denied" | "error";

function idempotencyKey(scope: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `community-moderation:${scope}:${random}`;
}

function safeError(error: ApiClientError | undefined, fallback: string): string {
  if (error?.status === 409) return "This moderation state changed. Refresh it before trying again.";
  return fallback;
}

export function CommunityModerationSettingsController(
  props: CommunityModerationSettingsControllerProps,
) {
  const api = props.api ?? createCommunityModerationSettingsApi();
  const [status, setStatus] = createSignal<LoadStatus>("loading");
  const [message, setMessage] = createSignal("");
  const [capabilities, setCapabilities] = createSignal<CommunityModerationCapabilities>([]);
  const [caseView, setCaseView] = createSignal<CommunityModerationCaseView>("open");
  const [caseBundle, setCaseBundle] = createSignal<CommunityModerationCaseBundle>();
  const [actionBusy, setActionBusy] = createSignal<Readonly<{
    action: CommunityModerationCaseAction;
    caseRef: string;
  }>>();
  const [policy, setPolicy] = createSignal<CommunityModerationPolicy>();
  const [policyDecisions, setPolicyDecisions] = createSignal<CommunityModerationPolicyDecisions>();
  const [policyDirty, setPolicyDirty] = createSignal(false);
  const [policySaving, setPolicySaving] = createSignal(false);
  const commandKeys = new Map<string, string>();
  let active = true;
  let requestGeneration = 0;

  onCleanup(() => {
    active = false;
    requestGeneration += 1;
  });

  const commandKey = (scope: string): string => {
    const existing = commandKeys.get(scope);
    if (existing !== undefined) return existing;
    const created = idempotencyKey(scope);
    commandKeys.set(scope, created);
    return created;
  };

  const loadQueue = async (view: CommunityModerationCaseView, request = ++requestGeneration) => {
    setStatus("loading");
    setMessage("");
    try {
      const bundle = await api.getCases({ communityId: props.communityId, view });
      if (!active || request !== requestGeneration) return;
      setCaseView(view);
      setCaseBundle(bundle);
      setStatus("ready");
    } catch (error) {
      if (!active || request !== requestGeneration) return;
      setMessage(safeError(error instanceof ApiClientError ? error : undefined, "The moderation queue could not be loaded."));
      setStatus("error");
    }
  };

  const loadPolicy = async (request = ++requestGeneration) => {
    setStatus("loading");
    setMessage("");
    try {
      const nextPolicy = await api.getPolicy({ communityId: props.communityId });
      if (!active || request !== requestGeneration) return;
      setPolicy(nextPolicy);
      setPolicyDecisions(moderationPolicyDecisions(nextPolicy));
      setPolicyDirty(false);
      setStatus("ready");
    } catch (error) {
      if (!active || request !== requestGeneration) return;
      setMessage(safeError(error instanceof ApiClientError ? error : undefined, "The content policy could not be loaded."));
      setStatus("error");
    }
  };

  const load = async () => {
    const request = ++requestGeneration;
    setStatus("loading");
    setMessage("");
    try {
      const nextCapabilities = await api.getCapabilities({ communityId: props.communityId });
      if (!active || request !== requestGeneration) return;
      if (!nextCapabilities.includes("moderation.view")) {
        setStatus("denied");
        return;
      }
      setCapabilities(nextCapabilities);
      if (props.section === "moderation_queue") await loadQueue(caseView(), request);
      else await loadPolicy(request);
    } catch (error) {
      if (!active || request !== requestGeneration) return;
      if (error instanceof ApiClientError && (error.status === 401 || error.status === 404)) {
        setStatus("denied");
        return;
      }
      setMessage("Community moderation settings could not be loaded.");
      setStatus("error");
    }
  };

  createEffect(
    () => `${props.communityId}:${props.section}`,
    () => { queueMicrotask(() => { if (active) void load(); }); },
  );

  const changeView = (view: CommunityModerationCaseView) => {
    if (view !== caseView()) void loadQueue(view);
  };

  const caseActionKey = (caseRef: string, action: CommunityModerationCaseAction): string => {
    const revision = caseBundle()?.cases.items.find((item) => item.case_ref === caseRef)?.case_revision ?? "unknown";
    return commandKey(`case:${caseRef}:${revision}:${action}`);
  };

  const actOnCase = async (input: CommunityModerationCaseActionInput) => {
    if (actionBusy() !== undefined) return;
    setActionBusy({ action: input.body.action, caseRef: input.path.caseRef });
    setMessage("");
    try {
      await api.actOnCase(input);
      if (!active) return;
      await loadQueue(caseView());
    } catch (error) {
      if (active) setMessage(safeError(error instanceof ApiClientError ? error : undefined, "The moderation action could not be completed."));
    } finally {
      if (active) setActionBusy(undefined);
    }
  };

  const changePolicyDecision = (
    category: CommunityModerationPolicyCategory,
    decision: CommunityModerationPolicyDecision,
  ) => {
    setPolicyDecisions((current) => current === undefined ? current : { ...current, [category]: decision });
    setPolicyDirty(true);
  };

  const savePolicy = async (input: CommunityModerationPolicyUpdateInput) => {
    if (policySaving()) return;
    setPolicySaving(true);
    setMessage("");
    try {
      const updated = await api.updatePolicy(input);
      if (!active) return;
      setPolicy(updated);
      setPolicyDecisions(moderationPolicyDecisions(updated));
      setPolicyDirty(false);
    } catch (error) {
      if (active) setMessage(safeError(error instanceof ApiClientError ? error : undefined, "The content policy could not be saved."));
    } finally {
      if (active) setPolicySaving(false);
    }
  };

  return (
    <Show when={status() !== "loading"} fallback={(
      <Card class="grid min-h-64 place-items-center" role="status">
        <div class="flex items-center gap-3"><Spinner class="size-5" /><Type variant="body">Loading moderation settings…</Type></div>
      </Card>
    )}>
      <Show when={status() !== "denied"} fallback={(
        <Card class="p-6" data-owner-settings-denied>
          <Type as="h2" variant="h2">Owner access required</Type>
          <Type as="p" class="mt-2 text-muted-foreground" variant="body">These settings are available only to this community's owner.</Type>
        </Card>
      )}>
        <Show when={status() !== "error"} fallback={(
          <Card class="p-6" role="alert">
            <FormNote tone="destructive">{message()}</FormNote>
            <Button class="mt-4" onClick={() => void load()} variant="secondary">Try again</Button>
          </Card>
        )}>
          <Show when={props.section === "moderation_queue" ? caseBundle() : undefined}>
            {(bundle) => (
              <CommunityModerationQueuePanel
                actionBusy={actionBusy()}
                capabilities={capabilities()}
                caseActionIdempotencyKey={caseActionKey}
                cases={bundle().cases}
                caseView={caseView()}
                details={bundle().details}
                errorMessage={message() || undefined}
                onCaseAction={(input) => void actOnCase(input)}
                onCaseViewChange={changeView}
                showHeading={false}
              />
            )}
          </Show>
          <Show when={props.section === "content_policy" && policy() !== undefined && policyDecisions() !== undefined}>
            <CommunityModerationPolicyPanel
              capabilities={capabilities()}
              errorMessage={message() || undefined}
              onPolicyDecisionChange={changePolicyDecision}
              onPolicySave={(input) => void savePolicy(input)}
              policy={policy()!}
              policyDecisions={policyDecisions()!}
              policyDirty={policyDirty()}
              policySaving={policySaving()}
              showHeading={false}
            />
          </Show>
        </Show>
      </Show>
    </Show>
  );
}
