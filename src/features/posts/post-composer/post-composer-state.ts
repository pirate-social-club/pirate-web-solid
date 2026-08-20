export type PostComposerTerminalStatus = "published" | "manual_review" | "blocked";

export type PostComposerState =
  | { readonly status: "editing" }
  | { readonly status: "submitting" }
  | { readonly status: "published" }
  | { readonly status: "manual_review" }
  | { readonly status: "blocked" }
  | { readonly status: "failure"; readonly message: string };

export type PostComposerEvent =
  | { readonly type: "submit" }
  | { readonly type: "published" }
  | { readonly type: "manual_review" }
  | { readonly type: "blocked" }
  | { readonly type: "failure"; readonly message: string }
  | { readonly type: "retry" }
  | { readonly type: "edit" };

export const initialPostComposerState: PostComposerState = { status: "editing" };

/**
 * The response contract is intentionally represented only by its frozen
 * publication states here. Wire decoding belongs to the API integration
 * tranche after the moderated-post response is accepted.
 */
export function reducePostComposerState(
  state: PostComposerState,
  event: PostComposerEvent,
): PostComposerState {
  switch (event.type) {
    case "submit":
      return state.status === "editing" || state.status === "failure"
        ? { status: "submitting" }
        : state;
    case "published":
      return state.status === "submitting" ? { status: "published" } : state;
    case "manual_review":
      return state.status === "submitting" ? { status: "manual_review" } : state;
    case "blocked":
      return state.status === "submitting" ? { status: "blocked" } : state;
    case "failure":
      return state.status === "submitting" ? { status: "failure", message: event.message } : state;
    case "retry":
      return state.status === "failure" ? { status: "submitting" } : state;
    case "edit":
      return state.status === "published" || state.status === "manual_review" || state.status === "blocked"
        ? { status: "editing" }
        : state;
  }
}
