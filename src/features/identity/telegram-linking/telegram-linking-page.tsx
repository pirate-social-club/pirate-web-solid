import { For, Show, createSignal, onCleanup, createEffect } from "solid-js";
import { Button } from "../../../design-system";
import { resolveSession, refreshSession, onSessionRefreshed, type AuthenticatedSession } from "../../../api/session";
import { createActivityPersonaPreparationApi } from "../activity-persona-preparation";
import { communityJoinCandidates } from "../community-persona-choice";
import { createTelegramLinkingApi, telegramLinkFailure, type TelegramLinkTransaction, type TelegramLinkingApi } from "./telegram-linking-api";
import { communityBotUrl, confirmedTransactionId, linkReference, takeTelegramCallback, telegramAuthorizationUrl, type TelegramCallback } from "./telegram-linking-navigation";

export interface TelegramLinkingPageProps {
  mode: "start" | "callback";
  api?: TelegramLinkingApi;
  resolveSession?: typeof resolveSession;
  preparePersona?: ReturnType<typeof createActivityPersonaPreparationApi>["prepare"];
  navigate?: (url: string) => void;
}

export function TelegramLinkingPage(props: TelegramLinkingPageProps) {
  const api = props.api ?? createTelegramLinkingApi();
  const [phase, setPhase] = createSignal<"loading" | "anonymous" | "start" | "login" | "confirm" | "busy" | "done" | "error">("loading");
  const [session, setSession] = createSignal<AuthenticatedSession>();
  const [transaction, setTransaction] = createSignal<TelegramLinkTransaction>();
  const [personaId, setPersonaId] = createSignal("");
  const [message, setMessage] = createSignal("");
  const [retryable, setRetryable] = createSignal(false);
  const [needsPersonaSetup, setNeedsPersonaSetup] = createSignal(false);
  const [checkingSession, setCheckingSession] = createSignal(false);
  let sessionRevision = 0;
  let sessionCheck: Promise<void> | undefined;
  let reference: string | undefined;
  let authorization: string | undefined;
  let callback: TelegramCallback | undefined;
  let active = true;
  let preparingPersona = false;
  let unsubscribe = () => {};
  const controller = new AbortController();
  const signal = controller.signal;
  const navigate = props.navigate ?? ((url: string) => window.location.assign(url));
  const replace = (path: string) => window.history.replaceState(null, "", path);
  const fail = (error: unknown) => {
    if (!active) return;
    const failure = telegramLinkFailure(error);
    setTransaction(current => current === undefined ? undefined : { ...current, confirmation_display: undefined });
    setMessage(failure.message); setRetryable(failure.retryable); setPhase("error");
    if (!failure.retryable) callback = undefined;
  };
  const candidates = () => communityJoinCandidates(session()?.personas ?? [], transaction()?.community_id ?? "");
  const selected = () => candidates().find(persona => persona.personaId === personaId());
  const botUrl = () => communityBotUrl(transaction()?.bot_username ?? "");
  const personaSetupHref = () => `/p/${encodeURIComponent(transaction()?.post_id ?? "")}/study`;

  const cancelForSession = (reason: string) => {
    active = false; controller.abort(); callback = undefined; authorization = undefined;
    setTransaction(undefined); setPersonaId(""); setRetryable(false);
    setNeedsPersonaSetup(false); setMessage(reason); setPhase("error");
  };

  async function sessionReady() {
    while (active && checkingSession()) await sessionCheck;
    return active;
  }

  async function verify() {
    if (!active || checkingSession() || phase() === "busy") return;
    const proof = callback;
    if (proof === undefined) { fail(undefined); return; }
    setPhase("busy");
    try {
      const verified = await api.verify(proof, signal);
      callback = undefined;
      if (!await sessionReady()) return;
      if (verified.state !== "verified" || verified.telegram_user_id === null) { fail(undefined); return; }
      setTransaction(verified);
      // Transaction id is not login evidence; get/confirm still enforce all browser/session bindings.
      replace(`/telegram/link/callback?transaction_id=${encodeURIComponent(verified.id)}`);
      setPhase("confirm");
    } catch (error) { fail(error); }
  }

  async function start() {
    if (!active || checkingSession() || phase() === "busy") return;
    if (reference === undefined) { fail(undefined); return; }
    setPhase("busy");
    try {
      const started = await api.start(reference, signal);
      if (!await sessionReady()) return;
      authorization = telegramAuthorizationUrl(started.authorization_url);
      if (authorization === undefined || started.transaction.state !== "pending") { fail(undefined); return; }
      setTransaction(started.transaction); setPhase("login");
    } catch (error) { fail(error); }
  }

  async function prepare() {
    if (!active || checkingSession() || phase() !== "confirm") return;
    const persona = selected(), current = transaction();
    if (persona === undefined || current === undefined || persona.communityBinding !== null) return;
    setPhase("busy");
    preparingPersona = true;
    try {
      const result = await (props.preparePersona ?? createActivityPersonaPreparationApi().prepare)({
        communityId: current.community_id,
        idempotencyKey: crypto.randomUUID(),
        choice: { kind: "existing", personaId: persona.personaId }, signal,
      });
      if (!await sessionReady()) return;
      if (result.persona_status !== "active" || result.persona_id !== persona.personaId) {
        setNeedsPersonaSetup(true);
        setTransaction({ ...current, confirmation_display: undefined });
        setMessage("Finish setting up this persona on Pirate before linking. Then return to your bot for a fresh link.");
        setRetryable(false); setPhase("error"); return;
      }
      refreshSession();
      const refreshed = await (props.resolveSession ?? resolveSession)();
      if (!await sessionReady()) return;
      if (refreshed === "anonymous" || refreshed.userId !== session()?.userId || refreshed.personasUnavailable) { fail(undefined); return; }
      setSession(refreshed); setPhase("confirm");
    } catch (error) { fail(error); }
    finally { preparingPersona = false; }
  }

  async function confirm() {
    if (!active || checkingSession() || phase() !== "confirm") return;
    const current = transaction(), persona = selected();
    if (current === undefined || persona?.communityBinding?.communityId !== current.community_id) return;
    setPhase("busy");
    try {
      await api.confirm(current.id, persona.personaId, signal);
      if (!await sessionReady()) return;
      // Do not retain the provider's display projection after confirmation.
      setTransaction({ ...current, confirmation_display: undefined });
      setPhase("done");
    } catch (error) { fail(error); }
  }

  createEffect(() => true, () => {
    if (typeof window === "undefined") return;
    const href = window.location.href;
    const restoredId = props.mode === "callback" ? confirmedTransactionId(href) : undefined;
    if (props.mode === "callback") callback = takeTelegramCallback(href, replace);
    else {
      reference = linkReference(href);
      replace(reference === undefined ? "/telegram/link" : `/telegram/link?navigation_reference=${encodeURIComponent(reference)}`);
    }
    const initialise = async (resolved: Awaited<ReturnType<typeof resolveSession>>) => {
      if (resolved === "anonymous") {
        callback = undefined;
        setPhase("anonymous"); return;
      }
      if (resolved.personasUnavailable) {
        setMessage("Your personas could not be loaded. Return to your bot and try a fresh link.");
        setPhase("error"); return;
      }
      setSession(resolved);
      if (props.mode === "start") {
        if (reference === undefined) { fail(undefined); return; }
        setPhase("start");
      } else if (callback !== undefined) await verify();
      else if (restoredId !== undefined) {
        const restored = await api.get(restoredId, signal);
        if (!await sessionReady()) return;
        if (restored.state !== "verified" || restored.telegram_user_id === null) { fail(undefined); return; }
        setTransaction(restored);
        replace(`/telegram/link/callback?transaction_id=${encodeURIComponent(restored.id)}`);
        setPhase("confirm");
      } else fail(undefined);
    };
    unsubscribe = onSessionRefreshed(() => {
      if (!active || preparingPersona) return;
      const revision = ++sessionRevision;
      const previous = session();
      setCheckingSession(true);
      sessionCheck = (async () => {
        try {
          const resolved = await (props.resolveSession ?? resolveSession)();
          if (!active || revision !== sessionRevision) return;
          if (previous !== undefined && (resolved === "anonymous" || resolved.userId !== previous.userId)) {
            cancelForSession("Your Pirate session changed. Return to your community bot and start a fresh link.");
          } else if (previous === undefined) {
            // Header sign-in before an attempt starts needs no fresh bot link.
            setCheckingSession(false);
            await initialise(resolved);
          } else if (resolved !== "anonymous" && !resolved.personasUnavailable) {
            // This refreshes display data only. API operations still enforce the
            // original session and private browser binding, even for the same account.
            setSession(resolved);
          } else {
            throw new Error("Session read unavailable");
          }
        } catch {
          if (!active || revision !== sessionRevision) return;
          cancelForSession("Your Pirate session could not be checked. Return to your community bot and start a fresh link.");
        } finally {
          if (revision === sessionRevision) setCheckingSession(false);
        }
      })();
    });
    void (async () => {
      try {
        const revision = sessionRevision;
        const resolved = await (props.resolveSession ?? resolveSession)();
        if (!active || revision !== sessionRevision) return;
        await initialise(resolved);
      } catch (error) { fail(error); }
    })();
  });
  onCleanup(() => { active = false; callback = undefined; authorization = undefined; controller.abort(); unsubscribe(); });

  const signInHref = () => {
    const returnPath = props.mode === "start" && reference !== undefined
      ? `/telegram/link?navigation_reference=${encodeURIComponent(reference)}` : "/telegram/link/account";
    return `/auth/sign-in?return_to=${encodeURIComponent(returnPath)}`;
  };
  return (
    <main data-route-path={props.mode === "start" ? "/telegram/link" : "/telegram/link/callback"} class="mx-auto w-full max-w-lg space-y-5 px-5 py-10">
      <h1 class="text-2xl font-semibold">Link Telegram with Pirate</h1>
      <p>Keep studying in your community’s bot. Pirate’s Telegram login proves which account belongs to you.</p>
      <p>The community owner can read your messages and listen to your voice notes. Owners of several bots can recognize the same Telegram identity across them.</p>
      <p>Read-aloud practice requires voice answers. You will read each line and record it; reference audio is not included.</p>
      <Show when={phase() === "loading" || phase() === "busy" || checkingSession()}><p role="status">Please wait…</p></Show>
      <Show when={phase() === "anonymous"}>
        <p>Sign in to Pirate first. Keep the whole linking flow in the same browser.</p>
        <Show when={props.mode === "callback"}><p>This login cannot continue after signing in again. Return to your community bot for a fresh link.</p></Show>
        <a href={signInHref()} class="underline">Sign in to Pirate</a>
      </Show>
      <Show when={phase() === "start"}>
        <p>You will confirm your Telegram account, community bot and chosen persona on Pirate before anything is linked.</p>
        <Button disabled={checkingSession()} onClick={() => void start()}>Review this link</Button>
      </Show>
      <Show when={transaction() !== undefined && phase() !== "error"}>
        <p>Community: {transaction()?.community_name}</p>
        <p>Bot: @{transaction()?.bot_username} (ID {transaction()?.bot_id})</p>
      </Show>
      <Show when={phase() === "login"}>
        <p>Only approve a Telegram login you started here. You will return to Pirate to choose your community persona.</p>
        <Button disabled={checkingSession()} onClick={() => { if (active && !checkingSession() && authorization !== undefined) navigate(authorization); }}>Continue with Telegram</Button>
      </Show>
      <Show when={phase() === "confirm"}>
        <p>Telegram account: {transaction()?.confirmation_display?.name} {transaction()?.confirmation_display?.username ? `@${transaction()?.confirmation_display?.username}` : ""} (ID {transaction()?.telegram_user_id})</p>
        <fieldset disabled={checkingSession()} class="space-y-3">
          <legend>Choose the persona this bot can use for Study</legend>
          <For each={candidates()}>{persona => (
            <label class="flex min-h-11 items-center gap-3">
              <input type="radio" name="telegram-persona" value={persona.personaId} checked={personaId() === persona.personaId} onChange={() => setPersonaId(persona.personaId)} />
              <span>{persona.displayName ?? persona.primaryPublicHandle ?? persona.personaId}{persona.communityBinding === null ? " — needs community setup" : ""}</span>
            </label>
          )}</For>
        </fieldset>
        <Show when={candidates().length === 0}><p>You need an active persona for this community. <a href={personaSetupHref()} class="underline">Set up your Study persona on Pirate</a>, then return to your community bot for a fresh link.</p></Show>
        <Show when={selected()?.communityBinding === null}>
          <p>This persona will become bound to {transaction()?.community_name}.</p>
          <Button disabled={checkingSession()} onClick={() => void prepare()}>Use this persona in this community</Button>
        </Show>
        <Show when={selected()?.communityBinding?.communityId === transaction()?.community_id && selected() !== undefined}>
          <p>Allow this bot to run Study for your chosen persona. This does not let it change your account or withdraw funds. Completed consent stays when this same bot’s token is rotated. You can revoke it on Pirate.</p>
          <Button disabled={checkingSession()} onClick={() => void confirm()}>Link this Telegram and persona</Button>
        </Show>
      </Show>
      <Show when={phase() === "done"}>
        <p role="status">Linked to {selected()?.displayName ?? selected()?.primaryPublicHandle ?? personaId()}.</p>
        <p>Return to your community bot and send /resume. If your song selection expired, send /study and choose again. This pilot is practice only; no reward or pool share is earned.</p>
        <Show when={botUrl()}>{href => <a class="underline" href={href()} rel="noreferrer">Return to your community bot</a>}</Show>
      </Show>
      <Show when={phase() === "error"}>
        <p role="alert">{message()}</p>
        <Show when={needsPersonaSetup()}><a class="underline" href={personaSetupHref()}>Finish persona and wallet setup on Pirate</a></Show>
        <Show when={retryable() && callback !== undefined}><Button disabled={checkingSession()} onClick={() => void verify()}>Try again</Button></Show>
      </Show>
      <a href="/telegram/link/account" class="block underline">Manage Telegram connections</a>
    </main>
  );
}
