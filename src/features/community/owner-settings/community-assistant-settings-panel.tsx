import { Button, FormFieldLabel, FormNote, Input, Textarea, Type } from "@pirate/web-solid-ui";
import { For, Show, createSignal } from "solid-js";
import { assistantSettingsValid, type AssistantOption, type AssistantProvider, type CommunityAssistantSettings, type CommunityTelegramSettings } from "./community-telegram-model";

export interface CommunityAssistantSettingsPanelProps {
  settings: CommunityTelegramSettings;
  models: ReadonlyArray<AssistantOption>;
  voices: ReadonlyArray<AssistantOption>;
  loading?: boolean;
  saving?: boolean;
  readOnly?: boolean;
  showHeading?: boolean;
  errorMessage?: string;
  successMessage?: string;
  onChange: (policy: CommunityAssistantSettings) => void;
  onSave: () => void;
  onCredentialSave: (provider: AssistantProvider, key: string) => Promise<void>;
  onRefreshOptions: () => void;
}

function CredentialField(props: { provider: AssistantProvider; status: CommunityTelegramSettings["openrouter"]; disabled: boolean; onSave: (provider: AssistantProvider, key: string) => Promise<void> }) {
  const [key, setKey] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const label = () => props.provider === "openrouter" ? "OpenRouter" : "ElevenLabs";
  async function save() {
    if (busy() || !key().trim()) return;
    setBusy(true); setError("");
    const submitted = key().trim();
    setKey("");
    try { await props.onSave(props.provider, submitted); }
    catch { setError(`${label()} key could not be saved. Check the key and try again.`); }
    finally { setBusy(false); }
  }
  return <div class="space-y-3 rounded-xl border border-border p-4">
    <FormFieldLabel htmlFor={`assistant-key-${props.provider}`} label={`${label()} API key`} />
    <p class="text-sm text-muted-foreground" role="status">{props.status.status === "valid" ? "Key connected" : props.status.status === "invalid" ? "Key needs attention" : "No key connected"}</p>
    <Input id={`assistant-key-${props.provider}`} type="password" autocomplete="new-password" spellcheck={false} maxlength={1024} value={key()} disabled={props.disabled || busy()} placeholder={props.status.status === "missing" ? "Paste API key" : "Paste a replacement key"} onInput={(event) => setKey(event.currentTarget.value)} />
    <FormNote>Stored keys are never shown again. Provider usage is charged to this key.</FormNote>
    <Show when={error()}><p role="alert" class="text-sm border-l-2 border-destructive pl-3 text-foreground">{error()}</p></Show>
    <Button type="button" disabled={props.disabled || busy() || !key().trim()} onClick={() => void save()}>{busy() ? "Checking key…" : "Check and save key"}</Button>
  </div>;
}

export function CommunityAssistantSettingsPanel(props: CommunityAssistantSettingsPanelProps) {
  const disabled = () => Boolean(props.loading || props.saving || props.readOnly);
  const update = (patch: Partial<CommunityAssistantSettings>) => props.onChange({ ...props.settings.assistant, ...patch });
  return <section aria-busy={props.loading || props.saving ? "true" : "false"} class="space-y-6">
    <div><Show when={props.showHeading !== false}><Type as="h2" variant="h2">Assistant</Type></Show><p class="mt-2 text-sm text-muted-foreground">Configure the community bot’s model, voice and daily limits.</p></div>
    <Show when={props.readOnly}><p role="status">Only a community owner can change assistant settings.</p></Show>
    <Show when={props.errorMessage}><p role="alert" class="border-l-2 border-destructive pl-3 text-foreground">{props.errorMessage}</p></Show>
    <Show when={props.successMessage}><p role="status">{props.successMessage}</p></Show>
    <Show when={props.loading}><p role="status">Loading assistant settings…</p></Show>
    <div class="grid gap-4 lg:grid-cols-2">
      <CredentialField provider="openrouter" status={props.settings.openrouter} disabled={disabled()} onSave={props.onCredentialSave} />
      <CredentialField provider="elevenlabs" status={props.settings.elevenlabs} disabled={disabled()} onSave={props.onCredentialSave} />
    </div>
    <fieldset disabled={disabled()} class="space-y-5">
      <legend class="sr-only">Assistant behavior</legend>
      <label class="flex items-center gap-3"><input type="checkbox" checked={props.settings.assistant.enabled} onChange={(event) => update({ enabled: event.currentTarget.checked })} /> Enable community assistant</label>
      <div class="space-y-2"><FormFieldLabel htmlFor="assistant-model" label="OpenRouter model" />
        <Input id="assistant-model" list="assistant-model-options" value={props.settings.assistant.model} maxlength={200} placeholder="Choose or enter a model ID" onInput={(event) => update({ model: event.currentTarget.value })} />
        <datalist id="assistant-model-options"><For each={props.models}>{(option) => <option value={option.id}>{option.name}</option>}</For></datalist>
      </div>
      <div class="space-y-2"><FormFieldLabel htmlFor="assistant-instructions" label="Community instructions" />
        <Textarea id="assistant-instructions" class="min-h-32" value={props.settings.assistant.instructions} maxlength={4000} onInput={(event) => update({ instructions: event.currentTarget.value })} />
        <FormNote>The assistant can reference public community content. Study, karaoke and rewards open in Pirate.</FormNote>
      </div>
      <label class="flex items-center gap-3"><input type="checkbox" checked={props.settings.assistant.voice_enabled} onChange={(event) => update({ voice_enabled: event.currentTarget.checked })} /> Enable ElevenLabs voice</label>
      <div class="grid gap-4 md:grid-cols-2">
        <div class="space-y-2"><FormFieldLabel htmlFor="assistant-voice" label="ElevenLabs voice" /><Input id="assistant-voice" list="assistant-voice-options" value={props.settings.assistant.voice_id} maxlength={128} placeholder="Choose or enter a voice ID" onInput={(event) => update({ voice_id: event.currentTarget.value })} /><datalist id="assistant-voice-options"><For each={props.voices}>{(option) => <option value={option.id}>{option.name}</option>}</For></datalist></div>
        <div class="space-y-2"><FormFieldLabel htmlFor="assistant-voice-model" label="Voice model" /><Input id="assistant-voice-model" value={props.settings.assistant.voice_model} maxlength={128} onInput={(event) => update({ voice_model: event.currentTarget.value })} /></div>
      </div>
      <div class="space-y-2"><FormFieldLabel htmlFor="assistant-voice-mode" label="Voice replies" />
        <select id="assistant-voice-mode" class="w-full rounded-lg border border-border bg-background p-3" value={props.settings.assistant.voice_reply_mode} onChange={(event) => { const mode = event.currentTarget.value; if (mode === "match_input" || mode === "always" || mode === "on_request") update({ voice_reply_mode: mode }); }}>
          <option value="match_input">Reply with voice to voice messages</option><option value="always">Include voice with every reply</option><option value="on_request">Only when requested</option>
        </select><FormNote>Voice replies also include text.</FormNote>
      </div>
      <div class="grid gap-4 md:grid-cols-3"><For each={[
        { key: "user_daily_messages" as const, label: "Messages per person / day" },
        { key: "community_daily_messages" as const, label: "Community messages / day" },
        { key: "daily_speech_characters" as const, label: "Speech characters / day" },
      ]}>{(limit) => <div class="space-y-2"><FormFieldLabel htmlFor={`assistant-${limit.key}`} label={limit.label} /><Input id={`assistant-${limit.key}`} type="number" min={1} max={100000} step={1} value={props.settings.assistant[limit.key]} onInput={(event) => update({ [limit.key]: event.currentTarget.valueAsNumber })} /></div>}</For></div>
      <label class="flex items-center gap-3"><input type="checkbox" checked={props.settings.assistant.remember_conversations} onChange={(event) => update({ remember_conversations: event.currentTarget.checked })} /> Remember recent conversation context for up to 24 hours</label>
      <FormNote>Messages go to OpenRouter and its model provider. Voice also goes to ElevenLabs. Provider retention policies apply. Daily limits remain active when conversation history is off.</FormNote>
    </fieldset>
    <div class="flex flex-wrap gap-3"><Button type="button" disabled={disabled() || !assistantSettingsValid(props.settings)} onClick={props.onSave}>{props.saving ? "Saving…" : "Save assistant settings"}</Button><Button type="button" variant="outline" disabled={disabled()} onClick={props.onRefreshOptions}>Refresh models and voices</Button></div>
  </section>;
}
