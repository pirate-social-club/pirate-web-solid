import { Show } from "solid-js";
import { IconDoorOpen, IconHandPalm, IconIdentificationCard } from "../../../design-system.ts";
import type { CommunityMembershipMode } from "./page-shell-model.ts";
import { communityJoinText, type CommunityJoinRule } from "./community-join-rule-model.ts";

export function CommunityJoinRuleRow(props: { readonly rule?: CommunityJoinRule; readonly mode?: CommunityMembershipMode }) {
  const rule = (): CommunityJoinRule => props.rule ?? (props.mode === "open" ? { kind: "open" } : { kind: "unsupported" });
  return <Show when={props.mode !== "request" && (props.rule || props.mode)}><div class="flex items-center gap-3 pt-1" data-community-join-rule><span class="grid size-6 shrink-0 place-items-center"><Show when={rule().kind === "open"} fallback={<Show when={rule().kind === "palm"} fallback={<IconIdentificationCard class="size-5" />}><IconHandPalm class="size-5" /></Show>}><IconDoorOpen class="size-5" /></Show></span><p class="text-base font-medium leading-6">{communityJoinText(rule())}</p></div></Show>;
}
