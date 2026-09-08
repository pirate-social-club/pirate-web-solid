import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import { Button, Card, FormNote, Spinner, Type } from "@pirate/web-solid-ui";
import { ApiClientError } from "@pirate/api-client";

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
  /**
   * Capabilities already read by the route. Supplying them keeps entry to one
   * round trip; omitting them makes the controller read its own, which is what
   * stories and isolated tests do.
   */
  capabilities?: CommunityModerationCapabilities;
  communityId: string;
  section: CommunityModerationSettingsSection;
}

type LoadStatus = "loading" | "ready" | "denied" | "error";

/**
 * A response is only applied when the community and view it was issued for are
 * still the ones on screen. Sequence alone is not enough: a slower read for the
 * previous view can land after a newer one and would otherwise overwrite it.
 */
interface RequestToken {
  communityId: string;
  sequence: number;
  view: CommunityModerationCaseView;
}

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
  const [refreshing, setRefreshing] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [capabilities, setCapabilities] = createSignal<CommunityModerationCapabilities>(props.capabilities ?? []);
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
  let sequence = 0;
  let current: RequestToken | undefined;

  onCleanup(() => {
    active = false;
    current = undefined;
  });

  const issue = (view: CommunityModerationCaseView): RequestToken => {
    const token = { communityId: props.communityId, sequence: ++sequence, view };
    current = token;
    return token;
  };

  const stale = (token: RequestToken): boolean =>
    !active
    || current === undefined
    || current.sequence !== token.sequence
    || current.communityId !== token.communityId
    || current.view !== token.view;

  const commandKey = (scope: string): string => {
    const existing = commandKeys.get(scope);
    if (existing !== undefined) return existing;
    const created = idempotencyKey(scope);
    commandKeys.set(scope, created);
    return created;
  };

  const loadQueue = async (view: CommunityModerationCaseView, token = issue(view)) => {
    // The requested view is selected before the read starts, so its control
    // reflects the click immediately and the list it replaces stays on screen
    // until the new one arrives.
    setCaseView(view);
    if (caseBundle() === undefined) setStatus("loading");
    else setRefreshing(true);
    setMessage("");
    try {
      const bundle = await api.getCases({ communityId: token.communityId, view: token.view });
      if (stale(token)) return;
      setCaseBundle(bundle);
      setStatus("ready");
    } catch (error) {
      if (stale(token)) return;
      const failure = safeError(error instanceof ApiClientError ? error : undefined, "The moderation queue could not be loaded.");
      if (error instanceof ApiClientError && (error.status === 401 || error.status === 404)) {
        setStatus("denied");
        return;
      }
      setMessage(failure);
      // A failed refresh keeps the list it could not replace; only a first read
      // has nothing to fall back to.
      if (caseBundle() === undefined) setStatus("error");
    } finally {
      if (active) setRefreshing(false);
    }
  };

  const loadPolicy = async (token = issue(caseView())) => {
    if (policy() === undefined) setStatus("loading");
    else setRefreshing(true);
    setMessage("");
    try {
      const nextPolicy = await api.getPolicy({ communityId: token.communityId });
      if (stale(token)) return;
      setPolicy(nextPolicy);
      setPolicyDecisions(moderationPolicyDecisions(nextPolicy));
      setPolicyDirty(false);
      setStatus("ready");
    } catch (error) {
      if (stale(token)) return;
      setMessage(safeError(error instanceof ApiClientError ? error : undefined, "The content policy could not be loaded."));
      if (policy() === undefined) setStatus("error");
    } finally {
      if (active) setRefreshing(false);
    }
  };

  const load = async () => {
    const token = issue(caseView());
    setMessage("");
    try {
      // The route already read capabilities for the navigation it rendered;
      // repeating that read here would add a round trip to every entry.
      const known = props.capabilities;
      const nextCapabilities = known ?? await api.getCapabilities({ communityId: token.communityId });
      if (stale(token)) return;
      if (!nextCapabilities.includes("moderation.view")) {
        setStatus("denied");
        return;
      }
      setCapabilities(nextCapabilities);
      if (props.section === "moderation_queue") await loadQueue(token.view, token);
      else await loadPolicy(token);
    } catch (error) {
      if (stale(token)) return;
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
    () => {
      // Solid 2 forbids writing signals from an owned scope, so the reset that
      // drops the previous community's cases happens with the read that
      // replaces them.
      queueMicrotask(() => {
        if (!active) return;
        setCaseBundle(undefined);
        setPolicy(undefined);
        setStatus("loading");
        void load();
      });
    },
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
      // A background refresh after the action; the list it replaces stays put.
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
                refreshing={refreshing()}
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
