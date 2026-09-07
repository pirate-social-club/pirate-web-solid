import { ApiClientError } from "@pirate/api-client";
import { Button } from "@pirate/web-solid-ui";
import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import { CommunityAssistantSettingsPanel } from "./community-assistant-settings-panel";
import { CommunityTelegramSettingsPanel } from "./community-telegram-settings-panel";
import { createCommunityTelegramSettingsApi, type CommunityTelegramSettingsApi } from "./community-telegram-settings-api";
import type { AssistantOption, CommunityTelegramDelivery, CommunityTelegramSettings, CommunityTelegramSetup } from "./community-telegram-model";

export function CommunityTelegramSettingsController(props: { communityId: string; section: "telegram" | "assistant"; api?: CommunityTelegramSettingsApi }) {
  const api = props.api ?? createCommunityTelegramSettingsApi();
  const [settings, setSettings] = createSignal<CommunityTelegramSettings>();
  const [models, setModels] = createSignal<ReadonlyArray<AssistantOption>>([]);
  const [voices, setVoices] = createSignal<ReadonlyArray<AssistantOption>>([]);
  const [deliveries, setDeliveries] = createSignal<ReadonlyArray<CommunityTelegramDelivery>>([]);
  const [setup, setSetup] = createSignal<CommunityTelegramSetup>();
  const [loading, setLoading] = createSignal(true);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [success, setSuccess] = createSignal("");
  let active = true;
  let generation = 0;
  onCleanup(() => { active = false; generation += 1; });
  const key = () => `telegram:${crypto.randomUUID()}`;
  const failure = (reason: unknown) => reason instanceof ApiClientError && reason.status === 409
    ? "These settings changed in another session. Refresh before saving again."
    : reason instanceof ApiClientError && (reason.status === 401 || reason.status === 404)
      ? "Only a community owner can access these settings."
      : "That change could not be completed. Refresh to check the current status.";

  async function options(current: CommunityTelegramSettings) {
    const results = await Promise.allSettled([
      current.openrouter.status === "valid" ? api.getModels(current.community_id) : Promise.resolve({ items: [] }),
      current.elevenlabs.status === "valid" ? api.getVoices(current.community_id) : Promise.resolve({ items: [] }),
    ]);
    if (!active || props.communityId !== current.community_id) return;
    if (results[0].status === "fulfilled") setModels(results[0].value.items);
    if (results[1].status === "fulfilled") setVoices(results[1].value.items);
    if (results.some((result) => result.status === "rejected")) setError("Some models or voices could not be loaded. Your saved settings are still available.");
  }
  async function load() {
    const request = ++generation;
    setLoading(true); setError("");
    try {
      const current = await api.getSettings({ communityId: props.communityId });
      if (!active || request !== generation) return;
      setSettings(current);
      const [activity, selection] = await Promise.all([api.getDeliveries(current.community_id), setup() ? api.getSetup(current.community_id, setup()!.id) : Promise.resolve(undefined)]);
      if (!active || request !== generation) return;
      setDeliveries(activity.items); setSetup(selection);
      await options(current);
    } catch (reason) { if (active && request === generation) setError(failure(reason)); }
    finally { if (active && request === generation) setLoading(false); }
  }
  createEffect(() => props.communityId, () => {
    setSettings(undefined); setSetup(undefined); setModels([]); setVoices([]); setDeliveries([]);
    queueMicrotask(() => { if (active) void load(); });
  });

  async function execute(action: (current: CommunityTelegramSettings, commandKey: string) => Promise<CommunityTelegramSettings | void>) {
    const current = settings();
    if (!current || busy()) return;
    const request = generation;
    setBusy(true); setError(""); setSuccess("");
    try {
      const next = await action(current, key());
      if (!active || request !== generation) return;
      if (next) setSettings(next);
      setSuccess("Settings saved.");
    } catch (reason) { if (active && request === generation) setError(failure(reason)); throw reason; }
    finally { if (active) setBusy(false); }
  }
  const run = (action: Parameters<typeof execute>[0]) => { void execute(action).catch(() => {}); };

  return <Show when={settings()} fallback={<div class="space-y-4"><p role={loading() ? "status" : "alert"}>{loading() ? "Loading community bot settings…" : error()}</p><Show when={!loading()}><Button onClick={() => void load()}>Try again</Button></Show></div>}>
    {(current) => <Show when={props.section === "assistant"} fallback={<CommunityTelegramSettingsPanel showHeading={false}
      settings={current()} setup={setup()} deliveries={deliveries()} loading={loading()} saving={busy()} errorMessage={error() || undefined}
      onConnect={(token) => execute((snapshot, commandKey) => api.connect(snapshot, token, commandKey))}
      onDisconnect={() => run((snapshot, commandKey) => api.disconnect(snapshot, commandKey))}
      onSetup={() => run(async (snapshot, commandKey) => { const result = await api.startSetup(snapshot, commandKey); if (active) setSetup(result); })}
      onConfirmChannel={() => run((snapshot, commandKey) => api.confirmSetup(snapshot, setup()!.id, commandKey))}
      onRefresh={() => void load()}
      onAutomaticChange={(enabled) => run((snapshot, commandKey) => api.save({ ...snapshot, automatic_publishing: enabled }, commandKey))}
      onBackfill={() => run(async (snapshot, commandKey) => { await api.backfill(snapshot, commandKey); })}
      onResolve={(id, resolution, messageId) => run(async (snapshot, commandKey) => { const next = await api.resolve(snapshot, id, resolution, commandKey, messageId); if (active) setDeliveries((items) => items.map((item) => item.id === id ? next : item)); })}
    />}><CommunityAssistantSettingsPanel showHeading={false} settings={current()} models={models()} voices={voices()} loading={loading()} saving={busy()} errorMessage={error() || undefined} successMessage={success() || undefined}
      onChange={(policy) => setSettings({ ...current(), assistant: policy })}
      onSave={() => run((snapshot, commandKey) => api.save(snapshot, commandKey))}
      onCredentialSave={(provider, credential) => execute(async (snapshot, commandKey) => { const result = await api.saveCredential(snapshot, provider, credential, commandKey); await options(result); return { ...result, assistant: snapshot.assistant }; })}
      onRefreshOptions={() => void options(current())}
    /></Show>}
  </Show>;
}
