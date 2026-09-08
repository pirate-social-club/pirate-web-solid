import { Show, createSignal } from "solid-js";
import { ActionMenu } from "@pirate/web-solid-ui";
import { RewardSponsorDialog } from "./reward-sponsor-dialog.tsx";

/** The post supplies canonical song identity; video IDs are never treated as songs. */
export function RewardSponsorAction(props: { communityId: string; postId: string; songTitle: string }) {
  const [open, setOpen] = createSignal(false);
  return <>
    <ActionMenu items={[{ key: "boost", label: "Boost" }]} onAction={key => { if (key === "boost") setOpen(true); }} />
    <Show when={open()}><RewardSponsorDialog communityId={props.communityId} postId={props.postId} songTitle={props.songTitle} onClose={() => setOpen(false)} /></Show>
  </>;
}
