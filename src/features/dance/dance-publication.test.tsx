import { afterEach, expect, test, vi } from "vitest";
import { createRoot, createSignal } from "solid-js";
import { render, type JSX } from "@solidjs/web";
import { createSessionApiClient } from "../../api/client";
import { createDancePublicationApi, dancePublicationMessage, type DancePost, type DancePublicationView } from "./dance-publication-api";
import { DancePublicationStatus } from "./dance-publication-status";

const unverified={state:"unverified"} as const;
const me={id:"participant",object:"user",verification_state:"unverified",created:1788495833,verification_capabilities:{unique_human:unverified,age_over_18:unverified,minimum_age:unverified,nationality:unverified,gender:unverified,wallet_score:unverified}} as const;
const scope={communityId:"community",reviewId:"review",accountId:"participant"};
const session=async()=>({status:"authenticated",userId:"participant",personas:[]}) as const;
const link={version:"dance-moderated-publication-v1",review_id:"review",status:"transferred",submission:{submission_id:"ordinary",href:"/media-post-submissions/ordinary"}} as const;
const post={submission_id:"ordinary",author_persona:{object:"persona",persona_id:"persona",display_name:null,avatar_ref:null,primary_public_handle:null},href:"/media-post-submissions/ordinary",track:"video",intent:"song_reference",creation_revision:1,video_revision:1,caption:null,updated_at:"2026-10-23T00:00:00Z",status:"published",published_resource:{post_id:"public-video",href:"/posts/public-video"}} as const satisfies DancePost;
const cleanups:Array<()=>void>=[];
afterEach(()=>{for(const dispose of cleanups.splice(0))dispose();document.body.replaceChildren();});
// SAFETY: vitest.app uses the DOM renderer; the app config resolves its server overload.
const renderDom=render as (view:()=>JSX.Element,host:HTMLElement)=>void;
function mount(view:()=>JSX.Element){const host=document.createElement("div");document.body.appendChild(host);createRoot(dispose=>{cleanups.push(dispose);renderDom(view,host);});return host;}

test("adoption is not publication, and only a published ordinary submission gets that label",()=>{
 expect(dancePublicationMessage("transferred",null)).toBe("Your recording was sent for publication.");
 expect(dancePublicationMessage("transferred",{...post,status:"processing",phase:"analysis"})).toBe("Your video post is processing.");
 expect(dancePublicationMessage("transferred",post)).toBe("Your video post was published.");
});
test("real generated reads bind the review and ordinary input, then check the current account",async()=>{
 const calls:string[]=[];let currentAccount="participant";
 const api=createDancePublicationApi(createSessionApiClient({origin:"https://pirate.sc",fetchImpl:async(input,init)=>{
  const url=String(input);calls.push(url);expect(init?.method).toBe("GET");expect(init?.credentials).toBe("same-origin");expect(new Headers(init?.headers).has("authorization")).toBe(false);
  return Response.json(url.endsWith("/publication")?link:url.endsWith("/ordinary")?post:{...me,id:currentAccount});
 }}));
 expect(await api.read(scope,new AbortController().signal)).toEqual({publication:link,post});

 expect(calls).toEqual(["https://pirate.sc/api/communities/community/dance/reviews/review/publication","https://pirate.sc/api/media-post-submissions/ordinary","https://pirate.sc/api/users/me"]);
 currentAccount="changed";await expect(api.read(scope,new AbortController().signal)).rejects.toThrow("session_changed");
});
test("the view reads only after an explicit check and links only the confirmed ordinary Post",async()=>{
 const read=vi.fn(async()=>({publication:link,post}));
 const host=mount(()=><DancePublicationStatus {...scope} initialStatus="transferred" api={{read}} session={session}/>);
 expect(host.textContent).toContain("sent for publication");expect(read).not.toHaveBeenCalled();expect(host.querySelector('a')).toBeNull();
 host.querySelector<HTMLButtonElement>('button')?.click();
 await vi.waitFor(()=>expect(host.querySelector('a[href="/post/public-video"]')).not.toBeNull());
 expect(host.textContent).toContain("Your video post was published.");expect(read).toHaveBeenCalledTimes(1);
});
test("route changes and page hiding abort a pending read and remove the old public link",async()=>{
 let finish!:(value:DancePublicationView)=>void;let signal:AbortSignal|undefined;
 const pending=new Promise<DancePublicationView>(resolve=>{finish=resolve;});
 const [reviewId,setReviewId]=createSignal("review");
 const host=mount(()=><DancePublicationStatus communityId="community" reviewId={reviewId()} initialStatus="transferred" session={session} api={{read:async(_scope,abort)=>{signal=abort;return pending;}}}/>);
 host.querySelector<HTMLButtonElement>('button')?.click();await vi.waitFor(()=>expect(signal).toBeDefined());
 setReviewId("other");await vi.waitFor(()=>expect(signal?.aborted).toBe(true));
 finish({publication:link,post});await Promise.resolve();expect(host.querySelector('a')).toBeNull();
 window.dispatchEvent(new Event("pagehide"));expect(host.querySelector('a')).toBeNull();
});
