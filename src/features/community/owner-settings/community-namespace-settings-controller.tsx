import { ApiClientError } from "@pirate/api-client";
import { Button, Card, FormNote, Spinner, Type } from "@pirate/web-solid-ui";
import { Show, createEffect, createSignal, onCleanup, untrack } from "solid-js";
import type { ApiFetch } from "../../../api/proxy";
import { createBobCommunityHnsWallet } from "./community-hns-wallet";
import {
  createCommunityNamespaceSettingsApi,
  CommunityNamespaceSettingsApiError,
  type CommunityNamespaceSettingsApiOptions,
} from "./community-namespace-settings-api";
import { CommunityNamespaceSettingsPanel } from "./community-namespace-settings-panel";
import { namespaceIdempotencyKeys } from "./community-namespace-idempotency";
import { useApplicationSession } from "../../shell/application-session";
import type {
  CommunityNamespaceSettingsPort,
  NamespaceCommandIdempotencyKeys,
  NamespaceSettingsCommand,
  NamespaceSettingsSnapshot,
} from "./owner-settings-model";

export interface CommunityNamespaceSettingsControllerProps {
  api?: CommunityNamespaceSettingsPort;
  communityId: string;
  communityPath: string;
  fetchImpl?: ApiFetch;
  origin?: string | URL;
}

type LoadStatus = "loading" | "ready" | "denied" | "error";

const PREPARATION_RETRY_STORAGE_PREFIX = "pirate:hns-preparation-retry:";

function storedPreparationRetryAt(userId: string): number | undefined {
  if (typeof sessionStorage === "undefined") return undefined;
  const value = Number(sessionStorage.getItem(`${PREPARATION_RETRY_STORAGE_PREFIX}${userId}`));
  if (!Number.isSafeInteger(value) || value <= Date.now() || value > Date.now() + 86_400_000) return undefined;
  return value;
}

function storePreparationRetryAt(userId: string, retryAt: number | undefined): void {
  if (typeof sessionStorage === "undefined") return;
  const key = `${PREPARATION_RETRY_STORAGE_PREFIX}${userId}`;
  if (retryAt === undefined) sessionStorage.removeItem(key);
  else sessionStorage.setItem(key, String(retryAt));
}

function operationKeys(): NamespaceCommandIdempotencyKeys {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return namespaceIdempotencyKeys(`hns-address:${random}`);
}

function nextOperationKey(kind: NamespaceSettingsCommand["kind"]): string {
  return operationKeys()[kind];
}

function commandError(error: unknown): string {
  if (error instanceof CommunityNamespaceSettingsApiError) return error.message;
  if (error instanceof ApiClientError && error.status === 401) {
    return "Your sign-in has expired. Sign in again, then retry. Your namespace is saved.";
  }
  if (error instanceof ApiClientError && error.status === 403) {
    return "This account cannot change the community address. Check that you are signed in to the owner account.";
  }
  if (error instanceof ApiClientError && error.status === 429) {
    return "Too many requests. Wait a moment before trying again.";
  }
  if (error instanceof ApiClientError && error.status === 409) {
    return "This address step could not continue. Your current setup is saved.";
  }
  if (error instanceof ApiClientError && error.code === "provider_unavailable" && !error.retryable) {
    return "HNS address setup is unavailable. Your progress is saved; this needs a service fix before you can continue.";
  }
  if (error instanceof ApiClientError && error.retryable) {
    return "The HNS verifier is temporarily unavailable. Try again in a moment.";
  }
  return "That HNS address step could not be completed.";
}

export function CommunityNamespaceSettingsController(
  props: CommunityNamespaceSettingsControllerProps,
) {
  const applicationSession = useApplicationSession();
  const api = untrack(() => {
    const apiOptions: CommunityNamespaceSettingsApiOptions = {
      communityId: props.communityId,
      communityPath: props.communityPath,
      ...(props.fetchImpl === undefined ? {} : { fetchImpl: props.fetchImpl }),
      ...(props.origin === undefined ? {} : { origin: props.origin }),
    };
    return props.api ?? createCommunityNamespaceSettingsApi(apiOptions);
  });
  const wallet = createBobCommunityHnsWallet();
  const [status, setStatus] = createSignal<LoadStatus>("loading");
  const [snapshot, setSnapshot] = createSignal<NamespaceSettingsSnapshot>();
  const [draftRootLabel, setDraftRootLabel] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [preparationRetryAt, setPreparationRetryAt] = createSignal<number>();
  let preparationAccountId: string | undefined;
  const accountId = () => {
    const session = applicationSession();
    return session !== undefined && session !== "resolving" && session !== "failed" && session !== "anonymous"
      ? session.userId
      : undefined;
  };
  const feedback = () => {
    if (message()) return message();
    const retryAt = preparationRetryAt();
    if (retryAt === undefined) return "";
    const localTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(retryAt);
    return `This account has prepared three record lists across its communities in 24 hours. You can get another after ${localTime}.`;
  };
  createEffect(
    accountId,
    (userId) => {
      if (userId === undefined || userId === preparationAccountId) return;
      const stored = storedPreparationRetryAt(userId);
      preparationAccountId = userId;
      queueMicrotask(() => {
        if (accountId() === userId) setPreparationRetryAt(stored);
      });
    },
  );
  createEffect(
    preparationRetryAt,
    (retryAt) => {
      if (retryAt === undefined) return;
      const retryAccountId = preparationAccountId;
      const timer = setTimeout(() => {
        if (retryAccountId !== undefined) storePreparationRetryAt(retryAccountId, undefined);
        setPreparationRetryAt(undefined);
      }, Math.max(0, retryAt - Date.now()));
      onCleanup(() => clearTimeout(timer));
    },
  );
  const [activeCommand, setActiveCommand] = createSignal<NamespaceSettingsCommand["kind"]>();
  const [pollFailed, setPollFailed] = createSignal(false);
  const [unchangedReads, setUnchangedReads] = createSignal(0);
  const [pageVisible, setPageVisible] = createSignal(typeof document === "undefined" || document.visibilityState !== "hidden");
  if (typeof document !== "undefined") {
    const updateVisibility = () => setPageVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", updateVisibility);
    onCleanup(() => document.removeEventListener("visibilitychange", updateVisibility));
  }
  const [keys, setKeys] = createSignal(operationKeys());
  let active = true;
  let requestGeneration = 0;

  onCleanup(() => {
    active = false;
    requestGeneration += 1;
  });

  const load = async () => {
    const request = ++requestGeneration;
    setStatus("loading");
    setMessage("");
    try {
      const current = await api.read();
      if (!active || request !== requestGeneration) return;
      setSnapshot(current);
      setDraftRootLabel(current.root_label);
      setStatus("ready");
    } catch (error) {
      if (!active || request !== requestGeneration) return;
      if (error instanceof ApiClientError && (error.status === 401 || error.status === 404)) {
        setStatus("denied");
      } else {
        setMessage("Community address settings could not be loaded.");
        setStatus("error");
      }
    }
  };

  createEffect(
    () => props.communityId,
    () => queueMicrotask(() => { if (active) void load(); }),
  );

  const execute = async (command: NamespaceSettingsCommand) => {
    if (!active || busy()) return;
    if ((command.kind === "restart" || command.kind === "start_verification") && preparationRetryAt() !== undefined) return;
    setBusy(true);
    setActiveCommand(command.kind);
    // Keep the named retry control mounted while its request is in flight.
    if (command.kind !== "poll") {
      setMessage("");
      setPollFailed(false);
    }
    try {
      const current = await api.execute(command);
      if (!active) return;
      const previous = snapshot();
      const advanced = previous?.generation !== current.generation || previous?.next_action.kind !== current.next_action.kind;
      setUnchangedReads(command.kind === "poll" && !advanced ? Math.min(4, unchangedReads() + 1) : 0);
      setSnapshot(current);
      setDraftRootLabel(current.root_label);
      setMessage("");
      setPollFailed(false);
      if (command.kind === "restart" || command.kind === "change_namespace") {
        setKeys(operationKeys());
      } else {
        setKeys((currentKeys) => ({ ...currentKeys, [command.kind]: nextOperationKey(command.kind) }));
      }
    } catch (error) {
      if (active) {
        setPollFailed(command.kind === "poll");
        if (error instanceof ApiClientError && error.status === 429 && error.details?.reason === "hns_preparation_daily_limit") {
          const seconds = error.details.retry_after_seconds;
          if (typeof seconds === "number" && Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 86_400) {
            const retryAt = Date.now() + seconds * 1_000;
            setPreparationRetryAt(retryAt);
            const userId = accountId();
            if (userId !== undefined) {
              preparationAccountId = userId;
              storePreparationRetryAt(userId, retryAt);
            }
            setMessage("");
            return;
          }
        }
        setMessage(command.kind === "poll" ? "Could not refresh verification status. Select Retry status to reconnect." : commandError(error));
      }
    } finally {
      if (active) setBusy(false);
    }
  };

  // A page waiting for wallet publication has no progress polling. Its deadline
  // must still end the attempt, including when the tab resumes after suspension.
  createEffect(
    () => ({ snapshot: snapshot(), visible: pageVisible() }),
    ({ snapshot: current, visible }) => {
      if (!visible || !current?.expires_at || ["verified", "expired", "failed"].includes(current.next_action.kind)) return;
      const remaining = Date.parse(current.expires_at) - Date.now();
      if (!Number.isFinite(remaining)) return;
      const timer = setTimeout(() => {
        if (Date.parse(current.expires_at!) > Date.now()) return;
        setSnapshot((latest) => latest === current ? { ...current, next_action: { kind: "expired" } } : latest);
      }, Math.max(0, Math.min(remaining, 2_147_483_647)));
      return () => clearTimeout(timer);
    },
  );

  createEffect(
    () => ({ busy: busy(), pollKey: keys().poll, snapshot: snapshot(), status: status(), failed: message() !== "", visible: pageVisible(), attempts: unchangedReads() }),
    ({ busy: polling, pollKey, snapshot: current, status: loadStatus, failed, visible, attempts }) => {
      if (!visible || failed || !current || polling || loadStatus !== "ready") return;
      const action = current.next_action;
      if (action.kind !== "wait" && !(action.kind === "publish_resource" && action.check_pending)) return;
      // Back off unchanged snapshots: 2, 4, 8, 16, then 30 seconds.
      // A longer server hint always takes precedence.
      const delayMs = Math.max(action.retry_after_seconds ?? 2, Math.min(30, 2 ** (attempts + 1))) * 1_000;
      const timer = setTimeout(() => {
        void execute({
          expected_generation: current.generation,
          idempotency_key: pollKey,
          kind: "poll",
        });
      }, delayMs);
      return () => clearTimeout(timer);
    },
  );

  return (
    <Show when={status() !== "loading"} fallback={(
      <Card class="grid min-h-64 place-items-center" role="status">
        <div class="flex items-center gap-3"><Spinner class="size-5" /><Type variant="body">Loading community address…</Type></div>
      </Card>
    )}>
      <Show when={status() !== "denied"} fallback={(
        <Card class="p-6" data-owner-settings-denied>
          <Type as="h2" variant="h2">Owner access required</Type>
          <Type as="p" class="mt-2 text-muted-foreground" variant="body">Community address settings are available only to this community's owner.</Type>
        </Card>
      )}>
        <Show when={status() !== "error"} fallback={(
          <Card class="p-6" role="alert">
            <FormNote tone="destructive">{message()}</FormNote>
            <Button class="mt-4" onClick={() => void load()} variant="secondary">Try again</Button>
          </Card>
        )}>
          <Show when={snapshot()}>{(current) => (
            <>
              <CommunityNamespaceSettingsPanel
                busy={busy() && activeCommand() !== "poll"}
                preparationDisabled={preparationRetryAt() !== undefined}
                draftRootLabel={draftRootLabel()}
                idempotencyKeys={keys()}
                onCommand={(command) => void execute(command)}
                onDraftRootLabelChange={setDraftRootLabel}
                showHeading={false}
                snapshot={current()}
                wallet={wallet}
              />
              <div class="flex h-20 items-center gap-3 overflow-auto">
                <div class="min-w-0 flex-1" role="status"><Show when={feedback()}><FormNote tone="muted">{feedback()}</FormNote></Show></div>
                <Show when={pollFailed()}>
                  <Button loading={busy()} onClick={() => {
                    const current = snapshot();
                    if (current) void execute({ kind: "poll", expected_generation: current.generation, idempotency_key: keys().poll });
                  }} variant="secondary">Retry status</Button>
                </Show>
              </div>
            </>
          )}</Show>
        </Show>
      </Show>
    </Show>
  );
}
