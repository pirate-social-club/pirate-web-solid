import { For, Show, createSignal, onCleanup, onSettled, untrack } from "solid-js";
import { Button, Type, buttonVariants } from "../../design-system.ts";
import { onSessionRefreshed, resolveSession, type SessionResolution } from "../../api/session.ts";
import { createNotificationsApi, type NotificationsApi } from "./notifications-api.ts";
import { createNotificationsController } from "./notifications-controller.ts";
import { bindPrivatePageLifecycle } from "./private-page-lifecycle.ts";
import { notificationHref, notificationLabel } from "./notification-entry.ts";

export function NotificationsInbox(props: { readonly api?: NotificationsApi; readonly session?: () => Promise<SessionResolution> }) {
  const controller = createNotificationsController(untrack(() => props.api ?? createNotificationsApi()), value => setState(value));
  const [state, setState] = createSignal(controller.state());
  let active = true, revision = 0;
  const resolve = async () => {
    const attempt = ++revision;
    // Clearing precedes session resolution, including an account/persona refresh.
    controller.pending();
    try {
      const session = await (props.session ?? resolveSession)();
      if (!active || attempt !== revision) return;
      await controller.session(session === "anonymous" ? undefined : `${attempt}:${session.userId}`);
    } catch { if (active && attempt === revision) setState({ ...controller.state(), phase: "error" }); }
  };
  onSettled(() => { void resolve(); });
  onCleanup(onSessionRefreshed(() => { void resolve(); }));
  onCleanup(bindPrivatePageLifecycle(() => { revision++; controller.pending(); }));
  onCleanup(() => { active = false; revision++; controller.dispose(); });
  return <main data-route-path="/activity" class="mx-auto flex w-full max-w-2xl flex-col gap-5 px-5 py-8">
    <Type as="h1" variant="h1">Notifications</Type>
    <Show when={state().unread !== undefined}><p role="status">{state().unread} unread</p></Show>
    <Show when={state().phase === "idle" || state().phase === "loading"}><p aria-busy="true">Loading notifications…</p></Show>
    <Show when={state().phase === "anonymous"}><p>Sign in to view your notifications.</p><a class={buttonVariants({ variant: "secondary" })} href="/auth/sign-in?return_to=%2Factivity">Sign in</a></Show>
    <Show when={state().phase === "error"}><p role="alert">Notifications could not be loaded.</p><Button onClick={() => void resolve()} variant="secondary">Retry notifications</Button></Show>
    <Show when={state().phase === "ready"}>
      <Button onClick={() => void controller.refresh()} variant="ghost" class="self-start">Refresh notifications</Button>
      <Show when={state().items.length > 0} fallback={<p>No notifications yet.</p>}>
        <ul class="divide-y divide-border-soft"><For each={state().items}>{item => <li class="flex flex-wrap items-center gap-3 py-4" data-notification-id={item.notification_id}>
          <div class="min-w-0 flex-1"><a class="font-medium hover:underline" href={notificationHref(item)}>{notificationLabel(item)}</a>
            <p class="text-sm text-muted-foreground"><time datetime={item.occurred_at}>{item.occurred_at}</time> · {item.read_at === null ? "Unread" : "Read"}</p></div>
          <Show when={item.read_at === null}><Button disabled={state().reading !== undefined} onClick={() => void controller.markRead(item.notification_id)} size="sm" variant="secondary">{state().reading === item.notification_id ? "Marking read…" : state().readIssue === item.notification_id ? "Retry marking read" : "Mark read"}</Button></Show>
          <Show when={state().readIssue === item.notification_id}><p role="alert" class="w-full">Read status could not be confirmed. Retry explicitly or refresh.</p></Show>
        </li>}</For></ul>
      </Show>
      <Show when={state().cursor !== null}><Button disabled={state().more === "loading"} onClick={() => void controller.more()} variant="secondary">{state().more === "loading" ? "Loading…" : state().more === "error" ? "Retry more notifications" : "More notifications"}</Button></Show>
      <Show when={state().more === "error"}><p role="alert">More notifications could not be loaded.</p></Show>
    </Show>
  </main>;
}
