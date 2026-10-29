import { ApiClientError } from "@pirate/api-client";
import { createEffect, createSignal, onCleanup, Show, untrack } from "solid-js";
import { captureSessionAuthority } from "../../api/browser-session-events";
import { onSessionRefreshed, resolveSession, type SessionResolution } from "../../api/session";
import { Button, buttonVariants } from "../../design-system";
import { bindPrivatePageLifecycle } from "../notifications/private-page-lifecycle";
import { createDancePublicationApi, dancePublicationMessage, type DancePublication, type DancePublicationApi, type DancePublicationView } from "./dance-publication-api";

type State = { readonly phase: "idle" | "loading" | "error" | "unavailable" | "anonymous" } | { readonly phase: "ready"; readonly view: DancePublicationView };
/** Presentation shared by explicit recovery and the continuous review observer. */
export function DancePublicationDetails(props: { readonly initialStatus: DancePublication["status"]; readonly view?: DancePublicationView }) {
  const published = () => { const post = props.view?.post; return post?.status === "published" ? post.published_resource.post_id : undefined; };
  return <section class="space-y-3" aria-label="Video post status" aria-live="polite">
    <p>{dancePublicationMessage(props.view?.publication.status ?? props.initialStatus, props.view?.post ?? null)}</p>
    <Show when={published()}>{id => <a class={buttonVariants({ variant: "secondary" })} href={`/post/${encodeURIComponent(id())}`}>View video post</a>}</Show>
  </section>;
}
/** Explicit status refresh performs GETs only. No processing, upload, retry or
 * publication command is issued, and SSR cannot start a private read. */
export function DancePublicationStatus(props: { readonly communityId: string; readonly reviewId: string; readonly initialStatus: DancePublication["status"]; readonly api?: DancePublicationApi; readonly session?: () => Promise<SessionResolution> }) {
  const api=untrack(()=>props.api ?? createDancePublicationApi());
  const [state,setState]=createSignal<State>({phase:"idle"},{ownedWrite:true});
  let active=true,revision=0,request: AbortController | undefined;
  const clear=()=>{revision++;request?.abort();setState({phase:"idle"});};
  const load=async()=>{
    clear();setState({phase:"loading"});
    const attempt=revision,communityId=props.communityId,reviewId=props.reviewId,current=new AbortController();request=current;
    const owns=()=>active&&!current.signal.aborted&&attempt===revision&&communityId===props.communityId&&reviewId===props.reviewId;
    try {
      const session=await (props.session ?? resolveSession)();if(!owns())return;
      if(session==="anonymous"){setState({phase:"anonymous"});return;}
      const authority=captureSessionAuthority();
      const view=await api.read({communityId,reviewId,accountId:session.userId},current.signal);
      if(!owns())return;
      if(captureSessionAuthority()!==authority){clear();return;}
      setState({phase:"ready",view});
    } catch(error) {
      if(owns())setState({phase:error instanceof ApiClientError&&error.declaredName==="AuthError"?"anonymous":error instanceof ApiClientError&&error.declaredName==="NotFound"?"unavailable":"error"});
    }
  };
  createEffect(()=>[props.communityId,props.reviewId,props.initialStatus] as const,clear);
  onCleanup(onSessionRefreshed(clear));onCleanup(bindPrivatePageLifecycle(clear));
  onCleanup(()=>{active=false;revision++;request?.abort();});
  const view=()=>{const current=state();return current.phase==="ready"?current.view:undefined;};
  const published=()=>{const post=view()?.post;return post?.status==="published"?post.published_resource.post_id:undefined;};
  return <section class="space-y-3" aria-label="Video post status" aria-live="polite">
    <p>{dancePublicationMessage(view()?.publication.status ?? props.initialStatus,view()?.post ?? null)}</p>
    <Show when={state().phase==="error"}><p role="status">We couldn’t confirm the video post’s current status. You can check again.</p></Show>
    <Show when={state().phase==="unavailable"}><p role="status">This video post status is not available.</p></Show>
    <Show when={state().phase==="anonymous"}><p role="status">Sign in to check your video post.</p></Show>
    <Show when={published()}>{id=><a class={buttonVariants({variant:"secondary"})} href={`/post/${encodeURIComponent(id())}`}>View video post</a>}</Show>
    <Button variant="secondary" disabled={state().phase==="loading"} onClick={()=>void load()}>{state().phase==="loading"?"Checking video post…":"Check video post"}</Button>
  </section>;
}
