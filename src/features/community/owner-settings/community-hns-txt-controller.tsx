import { ApiClientError } from "@pirate/api-client";
import { Button, Card, Type } from "@pirate/web-solid-ui";
import { Show, createSignal, onCleanup } from "solid-js";
import { requestGlobalSignInCompletion } from "../../auth/global-sign-in-host";
import type { ApiFetch } from "../../../api/proxy";
import {
  createCommunityHnsTxtApi,
  type CommunityHnsTxtApi,
  type HnsTxtAttachment,
} from "./community-hns-txt-api";

export interface CommunityHnsTxtControllerProps {
  api?: CommunityHnsTxtApi;
  communityId: string;
  fetchImpl?: ApiFetch;
  origin?: string | URL;
  onAuthenticated?: () => void;
}

function failureMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 429) return "This account has used its three address starts today. Try again tomorrow.";
    if (error.status === 409) return "This address is already in use or this community has an address. Refresh to see its current state.";
    if (error.status === 400) return "Enter a valid Handshake root name.";
    if (error.retryable) return "The check is temporarily unavailable. Try again.";
  }
  return "This address step could not be completed. Refresh to check its status.";
}

function key(): string {
  return `hns-txt-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

export function CommunityHnsTxtController(props: CommunityHnsTxtControllerProps) {
  const api = props.api ?? createCommunityHnsTxtApi({
    ...(props.fetchImpl === undefined ? {} : { fetchImpl: props.fetchImpl }),
    ...(props.origin === undefined ? {} : { origin: props.origin }),
  });
  const [loadStatus, setLoadStatus] = createSignal<"loading" | "ready" | "error" | "sign-in">("loading");
  const [attachment, setAttachment] = createSignal<HnsTxtAttachment | null>(null);
  const [rootLabel, setRootLabel] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const signInController = new AbortController();
  const startKeyName = () => `hns-txt-start:${props.communityId}`;
  let startAttempt: { root: string; idempotencyKey: string } | undefined;
  const clearStartAttempt = () => {
    startAttempt = undefined;
    try { sessionStorage.removeItem(startKeyName()); } catch { /* Browser storage may be disabled. */ }
  };
  const startKey = (root: string) => {
    if (startAttempt?.root === root) return startAttempt.idempotencyKey;
    try {
      const stored = sessionStorage.getItem(startKeyName());
      if (stored !== null) {
        // SAFETY: the root and key are checked below before the parsed attempt is reused.
        const attempt = JSON.parse(stored) as { root?: string; idempotencyKey?: string };
        if (attempt.root === root && typeof attempt.idempotencyKey === "string") {
          startAttempt = { root, idempotencyKey: attempt.idempotencyKey };
          return attempt.idempotencyKey;
        }
      }
    } catch { /* Use an in-memory key when browser storage is unavailable. */ }
    startAttempt = { root, idempotencyKey: key() };
    try { sessionStorage.setItem(startKeyName(), JSON.stringify(startAttempt)); } catch { /* In-memory retry remains safe in this tab. */ }
    return startAttempt.idempotencyKey;
  };
  let live = true;
  onCleanup(() => { live = false; signInController.abort(); });

  const refresh = async () => {
    try {
      const current = await api.current(props.communityId);
      if (!live) return;
      setAttachment(current);
      if (current !== null) setRootLabel(current.root_label);
      if (current?.status === "expired" || current?.status === "rejected") clearStartAttempt();
      setLoadStatus("ready");
    } catch (error) {
      if (!live) return;
      setLoadStatus(error instanceof ApiClientError && error.status === 401 ? "sign-in" : "error");
    }
  };
  if (typeof window !== "undefined") queueMicrotask(() => { if (live) void refresh(); });

  const signIn = async () => {
    if (await requestGlobalSignInCompletion(signInController.signal)) {
      (props.onAuthenticated ?? (() => window.location.reload()))();
    }
  };
  const run = async (action: () => Promise<HnsTxtAttachment>) => {
    if (busy()) return;
    setBusy(true);
    setMessage("");
    try {
      const next = await action();
      if (live) {
        setAttachment(next);
        setRootLabel(next.root_label);
        if (next.status === "expired" || next.status === "rejected") clearStartAttempt();
      }
    } catch (error) {
      if (!live) return;
      if (error instanceof ApiClientError && error.status === 401) {
        setLoadStatus("sign-in");
      } else {
        // A lost response may follow a committed write. Read before offering
        // another start so a retry cannot consume another preparation.
        try {
          const current = await api.current(props.communityId);
          if (live && current !== null) {
            setAttachment(current);
            setRootLabel(current.root_label);
            if (current.status === "expired" || current.status === "rejected") clearStartAttempt();
          } else if (live) {
            setMessage(failureMessage(error));
          }
        } catch (readError) {
          if (live) {
            if (readError instanceof ApiClientError && readError.status === 401) setLoadStatus("sign-in");
            else setLoadStatus("error");
          }
        }
      }
    } finally {
      if (live) setBusy(false);
    }
  };
  const start = (event: SubmitEvent) => {
    event.preventDefault();
    const root = event.currentTarget instanceof HTMLFormElement
      ? event.currentTarget.querySelector<HTMLInputElement>("input[name='root_label']")?.value.trim().replace(/\.$/u, "").toLowerCase() ?? ""
      : "";
    if (root === "") { setMessage("Enter a Handshake root name."); return; }
    void run(() => api.start(props.communityId, root, startKey(root)));
  };
  const check = () => {
    const current = attachment();
    if (current === null) return;
    void run(() => api.check(props.communityId, current.attachment_intent_id, key()));
  };
  const verifiedHref = () => {
    const current = attachment();
    const expected = current === null ? "" : `/c/${current.root_label}`;
    return current?.status === "attached" && current.route_href === expected ? expected : null;
  };

  return (
    <Card class="space-y-4 p-5" data-hns-txt-status={loadStatus() === "ready" ? (attachment()?.status ?? "empty") : loadStatus()}>
      <Type as="h2" variant="h3">Handshake address</Type>
      <Show when={loadStatus() === "loading"}><p role="status">Loading address…</p></Show>
      <Show when={loadStatus() === "error"}>
        <p role="alert">The address status could not be loaded.</p>
        <Button onClick={() => { setLoadStatus("loading"); void refresh(); }}>Try again</Button>
      </Show>
      <Show when={loadStatus() === "sign-in"}>
        <p role="alert">Sign in to manage this community address.</p>
        <Button onClick={() => void signIn()}>Sign in</Button>
      </Show>
      <Show when={loadStatus() === "ready"}>
        <Show when={attachment() === null || attachment()?.status === "expired" || attachment()?.status === "rejected"}>
          <form class="space-y-3" onSubmit={start}>
            <label class="block" for="hns-txt-root">Handshake root</label>
            <input id="hns-txt-root" name="root_label" class="w-full rounded border p-2" value={rootLabel()} onInput={(event) => setRootLabel(event.currentTarget.value)} autocomplete="off" placeholder="0qcm" />
            <Button type="submit" disabled={busy()}>{busy() ? "Starting…" : "Start verification"}</Button>
          </form>
        </Show>
        <Show when={attachment()?.status === "awaiting_txt"}>
          <p>Add this TXT record in Bob. Keep your existing records.</p>
          <dl class="space-y-2">
            <div><dt>TXT name</dt><dd><code data-hns-txt-name>{attachment()?.challenge?.name ?? ""}</code></dd></div>
            <div><dt>TXT value</dt><dd><code data-hns-txt-value class="break-all">{attachment()?.challenge?.value ?? ""}</code></dd></div>
          </dl>
          <Button disabled={busy() || attachment()?.challenge === null} onClick={check}>{busy() ? "Checking…" : "Check now"}</Button>
        </Show>
        <Show when={verifiedHref()}>{(href) => (
          <div>
            <p>Your Handshake address is verified.</p>
            <a class="underline" href={href()}>{typeof location === "undefined" ? href() : new URL(href(), location.origin).href}</a>
          </div>
        )}</Show>
        <Show when={attachment()?.status === "attached" && verifiedHref() === null}>
          <p role="alert">The verified route is unavailable. Refresh to check its status.</p>
        </Show>
        <Show when={attachment()?.status === "expired" || attachment()?.status === "rejected"}>
          <p>This verification has ended. Start again when you are ready.</p>
        </Show>
        <Show when={message() !== ""}><p role="alert">{message()}</p></Show>
      </Show>
    </Card>
  );
}
