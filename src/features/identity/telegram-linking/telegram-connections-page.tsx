import { For, Show, createSignal, createEffect, onCleanup } from "solid-js";
import { Button } from "../../../design-system";
import { resolveSession, onSessionRefreshed } from "../../../api/session";
import { createTelegramLinkingApi, telegramLinkFailure, type TelegramLinkAccount, type TelegramLinkingApi } from "./telegram-linking-api";
type ConnectionChange = Awaited<ReturnType<TelegramLinkingApi["revoke"] | TelegramLinkingApi["unlink"]>>;

export function TelegramConnectionsPage(props: { api?: TelegramLinkingApi; resolveSession?: typeof resolveSession }) {
  const api = props.api ?? createTelegramLinkingApi();
  const [account, setAccount] = createSignal<TelegramLinkAccount>();
  const [phase, setPhase] = createSignal<"loading" | "anonymous" | "ready" | "busy" | "error">("loading");
  const [message, setMessage] = createSignal("");
  const [removeId, setRemoveId] = createSignal<string>();
  let active = true, unsubscribe = () => {};
  const controller = new AbortController();
  async function load() {
    await Promise.resolve();
    if (!active) return;
    setPhase("loading");
    try {
      const session = await (props.resolveSession ?? resolveSession)();
      if (!active) return;
      if (session === "anonymous") { setPhase("anonymous"); return; }
      const result = await api.list(controller.signal);
      if (active) { setAccount(result); setPhase("ready"); }
    } catch (error) { if (active) { setMessage(telegramLinkFailure(error).message); setPhase("error"); } }
  }
  async function change(operation: () => Promise<ConnectionChange>) {
    if (phase() !== "ready") return;
    setPhase("busy");
    try {
      await operation();
      if (!active) return;
      setRemoveId(undefined); await load();
    } catch (error) { if (active) { setMessage(telegramLinkFailure(error).message); setPhase("error"); } }
  }
  createEffect(() => true, () => {
    if (typeof window === "undefined") return;
    unsubscribe = onSessionRefreshed(() => {
      active = false; controller.abort(); setAccount(undefined); setRemoveId(undefined);
      setMessage("Your Pirate session changed. Reload to manage the current account’s connections."); setPhase("error");
    });
    void load();
  });
  onCleanup(() => { active = false; controller.abort(); unsubscribe(); });
  return (
    <main data-route-path="/telegram/link/account" class="mx-auto w-full max-w-lg space-y-5 px-5 py-10">
      <h1 class="text-2xl font-semibold">Telegram connections</h1>
      <p>These connections are private to your Pirate account. Each community bot uses only the persona you authorized.</p>
      <Show when={phase() === "loading" || phase() === "busy"}><p role="status">Please wait…</p></Show>
      <Show when={phase() === "anonymous"}><a class="underline" href="/auth/sign-in?return_to=%2Ftelegram%2Flink%2Faccount">Sign in to manage connections</a></Show>
      <Show when={phase() === "error"}><p role="alert">{message()}</p><Button onClick={() => { if (active) void load(); else window.location.reload(); }}>Reload connections</Button></Show>
      <Show when={phase() === "ready"}>
        <Show when={account()?.telegram_user_ids.length === 0}><p>No Telegram account is linked. Choose a song in your community bot to start linking.</p></Show>
        <For each={account()?.grants ?? []}>{grant => (
          <section class="space-y-2 rounded-lg border p-4">
            <p>Community {grant.community_id} · bot ID {grant.bot_id}</p>
            <p>Persona {grant.persona_id} · Telegram ID {grant.telegram_user_id}</p>
            <Button variant="outline" onClick={() => void change(() => api.revoke(grant.community_id, grant.bot_id, controller.signal))}>Revoke this bot’s Study access</Button>
          </section>
        )}</For>
        <For each={account()?.telegram_user_ids ?? []}>{id => (
          <section class="space-y-2 rounded-lg border p-4">
            <p>Telegram account ID {id}</p>
            <Show when={removeId() === id} fallback={<Button variant="outline" onClick={() => setRemoveId(id)}>Review unlinking</Button>}>
              <p>Unlink this Telegram account and stop all its community bots from acting for your Pirate account? You will need to link again to continue in chat.</p>
              <Button onClick={() => void change(() => api.unlink(id, controller.signal))}>Unlink this Telegram account</Button>
              <Button variant="outline" onClick={() => setRemoveId(undefined)}>Keep connected</Button>
            </Show>
          </section>
        )}</For>
      </Show>
      <a class="block underline" href="/settings">Back to account settings</a>
    </main>
  );
}
