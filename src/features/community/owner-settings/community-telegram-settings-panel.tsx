import { Button, FormFieldLabel, FormNote, Input, Type } from "@pirate/web-solid-ui";
import { For, Show, createSignal } from "solid-js";
import type { CommunityTelegramDelivery, CommunityTelegramSettings, CommunityTelegramSetup } from "./community-telegram-model";

export interface CommunityTelegramSettingsPanelProps {
  settings: CommunityTelegramSettings;
  setup?: CommunityTelegramSetup;
  deliveries: ReadonlyArray<CommunityTelegramDelivery>;
  loading?: boolean;
  saving?: boolean;
  readOnly?: boolean;
  showHeading?: boolean;
  errorMessage?: string;
  onConnect: (token: string) => Promise<void>;
  onDisconnect: () => void;
  onSetup: () => void;
  onConfirmChannel: () => void;
  onRefresh: () => void;
  onAutomaticChange: (enabled: boolean) => void;
  onBackfill: () => void;
  onResolve: (id: string, resolution: "confirmed" | "not_sent" | "cancel", messageId?: number) => void;
}

function DeliveryReview(props: { item: CommunityTelegramDelivery; disabled: boolean; onResolve: CommunityTelegramSettingsPanelProps["onResolve"] }) {
  const [messageId, setMessageId] = createSignal("");
  return <div class="space-y-3 rounded-xl border border-border p-4">
    <p class="text-sm">{props.item.kind === "publication" ? "Content publication" : "Bot reply"} · {props.item.state}</p>
    <Show when={props.item.state === "uncertain" || props.item.state === "failed"}>
      <FormNote>Check the destination in Telegram before choosing an action. An uncertain delivery may already be visible.</FormNote>
      <FormFieldLabel htmlFor={`telegram-message-${props.item.id}`} label="Telegram message ID" />
      <Input id={`telegram-message-${props.item.id}`} type="number" min={1} step={1} value={messageId()} disabled={props.disabled} onInput={(event) => setMessageId(event.currentTarget.value)} />
      <div class="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={props.disabled || !Number.isSafeInteger(Number(messageId())) || Number(messageId()) < 1} onClick={() => props.onResolve(props.item.id, "confirmed", Number(messageId()))}>Confirm delivered</Button>
        <Button type="button" variant="outline" disabled={props.disabled} onClick={() => props.onResolve(props.item.id, "not_sent")}>Confirmed absent: retry</Button>
        <Button type="button" variant="outline" disabled={props.disabled} onClick={() => props.onResolve(props.item.id, "cancel")}>Cancel delivery</Button>
      </div>
    </Show>
  </div>;
}

export function CommunityTelegramSettingsPanel(props: CommunityTelegramSettingsPanelProps) {
  const [token, setToken] = createSignal("");
  const [connecting, setConnecting] = createSignal(false);
  const [connectError, setConnectError] = createSignal("");
  const [confirmDisconnect, setConfirmDisconnect] = createSignal(false);
  const disabled = () => Boolean(props.loading || props.saving || props.readOnly || connecting());
  async function connect() {
    if (disabled() || !token().trim()) return;
    const submitted = token().trim(); setToken(""); setConnecting(true); setConnectError("");
    try { await props.onConnect(submitted); }
    catch { setConnectError("The bot could not be connected. Check the token and try again."); }
    finally { setConnecting(false); }
  }
  return <section class="space-y-6" aria-busy={props.loading || props.saving ? "true" : "false"}>
    <div><Show when={props.showHeading !== false}><Type as="h2" variant="h2">Telegram</Type></Show><p class="mt-2 text-sm text-muted-foreground">Publish public community content to your channel and help people discover songs and rewards.</p></div>
    <Show when={props.loading}><p role="status">Loading Telegram settings…</p></Show>
    <Show when={props.readOnly}><p role="status">Only a community owner can change Telegram settings.</p></Show>
    <Show when={props.errorMessage || connectError()}><p role="alert" class="border-l-2 border-destructive pl-3 text-foreground">{props.errorMessage || connectError()}</p></Show>
    <div class="space-y-3 rounded-xl border border-border p-4">
      <p role="status">{props.settings.bot_username ? `@${props.settings.bot_username} · ${props.settings.status}` : "No bot connected"}</p>
      <FormFieldLabel htmlFor="telegram-bot-token" label={props.settings.bot_username ? "Replacement bot token" : "Bot token"} />
      <Input id="telegram-bot-token" type="password" autocomplete="new-password" spellcheck={false} maxlength={512} value={token()} disabled={disabled()} placeholder="Paste the token from BotFather" onInput={(event) => setToken(event.currentTarget.value)} />
      <FormNote>Use a bot owned by this community. Saved tokens are never shown again. Connecting a replacement requires selecting its channel again.</FormNote>
      <Button type="button" disabled={disabled() || !token().trim()} onClick={() => void connect()}>{connecting() ? "Connecting…" : "Connect bot"}</Button>
    </div>
    <div class="space-y-3 rounded-xl border border-border p-4">
      <h3 class="font-medium">Content channel</h3>
      <p>{props.settings.channel?.title ?? "No channel selected"}</p>
      <FormNote>Choose a channel you administer and give the bot permission to publish. Confirm the selected channel here to finish setup.</FormNote>
      <Button type="button" variant="outline" disabled={disabled() || props.settings.status !== "ready"} onClick={props.onSetup}>{props.settings.channel ? "Change channel" : "Choose channel"}</Button>
      <Show when={props.setup?.deep_link}><a class="block underline" href={props.setup?.deep_link ?? undefined} target="_blank" rel="noopener noreferrer">Open channel setup in Telegram</a></Show>
      <Show when={props.setup?.state === "selected"}><p>Selected: {props.setup?.channel_title}</p><Button type="button" disabled={disabled()} onClick={props.onConfirmChannel}>Confirm this channel</Button></Show>
      <Show when={props.setup?.state === "expired"}><p role="status">This setup link expired. Choose a channel again.</p></Show>
    </div>
    <div class="space-y-3">
      <label class="flex items-center gap-3"><input type="checkbox" checked={props.settings.automatic_publishing} disabled={disabled() || !props.settings.channel || props.settings.status !== "ready"} onChange={(event) => props.onAutomaticChange(event.currentTarget.checked)} /> Automatically publish new public content</label>
      <FormNote>Only eligible public content is shared. Song links open study, karaoke and available rewards in Pirate.</FormNote>
      <Button type="button" variant="outline" disabled={disabled() || !props.settings.channel} onClick={props.onBackfill}>Share latest 20 public posts</Button>
    </div>
    <div class="space-y-3"><div class="flex items-center justify-between gap-3"><h3 class="font-medium">Delivery activity</h3><Button type="button" variant="outline" disabled={disabled()} onClick={props.onRefresh}>Refresh status</Button></div>
      <Show when={props.deliveries.length > 0} fallback={<p class="text-sm text-muted-foreground">No deliveries yet.</p>}><For each={props.deliveries}>{(item) => <DeliveryReview item={item} disabled={disabled()} onResolve={props.onResolve} />}</For></Show>
    </div>
    <Show when={props.settings.bot_username}><div class="space-y-3 border-t border-border pt-5"><Button type="button" variant="outline" disabled={disabled()} onClick={() => setConfirmDisconnect(true)}>Disconnect bot</Button><Show when={confirmDisconnect()}><p>Disconnecting stops new bot work. Existing Telegram messages remain in the channel.</p><Button type="button" disabled={disabled()} onClick={() => { setConfirmDisconnect(false); props.onDisconnect(); }}>Confirm disconnect</Button><Button type="button" variant="outline" onClick={() => setConfirmDisconnect(false)}>Keep connected</Button></Show></div></Show>
  </section>;
}
