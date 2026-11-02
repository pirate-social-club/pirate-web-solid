import { Button, FormFieldLabel, FormNote, Input, Type } from "@pirate/web-solid-ui";
import { For, Show, createSignal } from "solid-js";
import type { CommunityTelegramDelivery, CommunityTelegramSettings, CommunityTelegramSetup, CommunityTelegramStudyCatalogue } from "./community-telegram-model";

export interface CommunityTelegramSettingsPanelProps {
  settings: CommunityTelegramSettings;
  setup?: CommunityTelegramSetup;
  deliveries: ReadonlyArray<CommunityTelegramDelivery>;
  loading?: boolean;
  saving?: boolean;
  readOnly?: boolean;
  showHeading?: boolean;
  errorMessage?: string;
  studyCatalogue?: CommunityTelegramStudyCatalogue;
  publishingStatus?: "loading" | "available" | "unavailable";
  onStudyChange: (enabled: boolean) => void;
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
    <div><Show when={props.showHeading !== false}><Type as="h2" variant="h2">Telegram</Type></Show><p class="mt-2 text-sm text-muted-foreground">Connect your community’s bot so learners can practise songs in Telegram.</p></div>
    <Show when={props.loading}><p role="status">Loading Telegram settings…</p></Show>
    <Show when={props.readOnly}><p role="status">Only a community owner can change Telegram settings.</p></Show>
    <Show when={props.errorMessage || connectError()}><p role="alert" class="border-l-2 border-destructive pl-3 text-foreground">{props.errorMessage || connectError()}</p></Show>
    <ol class="space-y-5">
    <li class="space-y-2">
      <h3 class="font-medium">1. Create your community bot</h3>
      <p class="text-sm text-muted-foreground">Open BotFather in Telegram, create a bot and copy its token. You can also connect a bot you already own.</p>
      <a class="inline-block underline" href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer">Open BotFather</a>
    </li>
    <li class="space-y-3 rounded-xl border border-border p-4">
      <h3 class="font-medium">2. Connect the bot</h3>
      <FormFieldLabel htmlFor="telegram-bot-token" label={props.settings.bot_username ? "Replacement bot token" : "Bot token"} />
      <Input id="telegram-bot-token" type="password" autocomplete="new-password" spellcheck={false} maxlength={512} value={token()} disabled={disabled()} placeholder="Paste the token from BotFather" onInput={(event) => setToken(event.currentTarget.value)} />
      <FormNote>Saved tokens are never shown again. A replacement bot needs Study enabled again and its publishing channel selected again.</FormNote>
      <Button type="button" disabled={disabled() || !token().trim()} onClick={() => void connect()}>{connecting() ? "Connecting…" : "Connect bot"}</Button>
    </li>
    <li class="space-y-3">
      <h3 class="font-medium">3. Open your bot</h3>
      <p role="status">{props.settings.bot_username ? `@${props.settings.bot_username} · ${props.settings.status === "ready" ? "Connected" : props.settings.status === "configuring" ? "Connecting…" : "Connection needs attention"}` : "No bot connected"}</p>
      <Show when={props.settings.bot_username && props.settings.status === "ready"}><a class="inline-block underline" href={`https://t.me/${encodeURIComponent(props.settings.bot_username ?? "")}`} target="_blank" rel="noopener noreferrer">Open bot in Telegram</a></Show>
      <Show when={props.settings.status === "configuring"}><FormNote>Your bot connection is being set up. Refresh the status to check when it is ready.</FormNote></Show>
      <Button type="button" variant="outline" disabled={disabled()} onClick={props.onRefresh}>Refresh connection status</Button>
    </li>
    </ol>
    <Show when={props.settings.bot_username}>
      <section class="space-y-3 border-t border-border pt-5" aria-label="Song practice">
        <h3 class="font-medium">Song practice</h3>
        <label class="flex items-center gap-3"><input type="checkbox" checked={props.settings.study_enabled}
          disabled={disabled() || (!props.settings.study_enabled && (props.settings.status !== "ready" || props.studyCatalogue?.availability !== "available"))}
          onChange={(event) => { const enabled = event.currentTarget.checked; event.currentTarget.checked = props.settings.study_enabled; props.onStudyChange(enabled); }} /> Enable song practice</label>
        <p role="status" class="text-sm text-muted-foreground">{props.loading ? "Checking available songs…"
          : props.studyCatalogue === undefined ? "Song availability could not be checked. Refresh to try again."
          : props.studyCatalogue.availability === "unavailable" ? "Song practice is not available yet."
          : props.studyCatalogue.items.length === 0 ? "No songs are ready for practice yet."
          : `${props.studyCatalogue.items.length}${props.studyCatalogue.next_cursor ? "+" : ""} ${props.studyCatalogue.items.length === 1 && !props.studyCatalogue.next_cursor ? "song is" : "songs are"} ready for practice.`}</p>
        <Show when={props.studyCatalogue?.availability === "available" && (props.studyCatalogue?.items.length ?? 0) > 0}>
          <ul class="space-y-1 text-sm"><For each={props.studyCatalogue?.items}>{song => <li>{song.title}</li>}</For></ul>
          <Show when={props.studyCatalogue?.next_cursor}><FormNote>More songs are available in the bot.</FormNote></Show>
        </Show>
        <FormNote>Ready songs from this community appear automatically as their lesson reviews and exercises become available. Telegram lessons are practice-only.</FormNote>
      </section>
    </Show>
    <details class="space-y-5 border-t border-border pt-5" open={props.setup?.state === "selected" || props.deliveries.some(item => item.state === "uncertain")}>
    <summary class="cursor-pointer font-medium">Advanced: channel publishing and delivery activity</summary>
    <FormNote>Channel publishing is optional. Learners practise in a private chat with your bot.</FormNote>
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
      <Show when={props.publishingStatus !== "loading" && props.publishingStatus !== "unavailable"}
        fallback={<p role="status" class="text-sm text-muted-foreground">{props.publishingStatus === "loading" ? "Checking publishing details…" : "Publishing details could not be loaded. Refresh to try again."}</p>}>
        <Show when={props.deliveries.length > 0} fallback={<p class="text-sm text-muted-foreground">No deliveries yet.</p>}><For each={props.deliveries}>{(item) => <DeliveryReview item={item} disabled={disabled()} onResolve={props.onResolve} />}</For></Show>
      </Show>
    </div>
    </details>
    <Show when={props.settings.bot_username}><div class="space-y-3 border-t border-border pt-5"><Button type="button" variant="outline" disabled={disabled()} onClick={() => setConfirmDisconnect(true)}>Disconnect bot</Button><Show when={confirmDisconnect()}><p>Disconnecting stops new bot work. Existing Telegram messages remain in the channel.</p><Button type="button" disabled={disabled()} onClick={() => { setConfirmDisconnect(false); props.onDisconnect(); }}>Confirm disconnect</Button><Button type="button" variant="outline" onClick={() => setConfirmDisconnect(false)}>Keep connected</Button></Show></div></Show>
  </section>;
}
