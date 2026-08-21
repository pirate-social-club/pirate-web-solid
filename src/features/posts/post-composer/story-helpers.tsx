import type { ParentProps } from "solid-js";

import { PostComposer } from "./post-composer";
import type { PostComposerProps } from "./types";

export function ComposerFrame(props: ParentProps<{ narrow?: boolean }>) {
  return (
    <div class={props.narrow ? "mx-auto min-h-screen w-full max-w-2xl px-4 py-6" : "mx-auto min-h-screen w-full max-w-5xl px-4 py-6"}>
      {props.children}
    </div>
  );
}

export function InteractiveComposer(props: PostComposerProps) {
  return <PostComposer {...props} />;
}
