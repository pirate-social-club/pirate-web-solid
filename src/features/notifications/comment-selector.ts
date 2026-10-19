export type CommentSelector = { readonly kind: "none" } | { readonly kind: "invalid" } | { readonly kind: "target"; readonly id: string };

/** Bounded Id contract, with controls and lossy URL decoding refused. */
export function validCommentId(value: string): boolean {
  return value.length > 0 && value.length <= 512 && value.trim().length > 0 && !/[\u0000-\u001f\u007f\ufffd]/u.test(value) && value !== "." && value !== "..";
}
export function commentSelector(search: string): CommentSelector {
  const params = new URLSearchParams(search);
  const values = params.getAll("comment");
  if (values.length === 0) return { kind: "none" };
  if (values.length !== 1 || !validCommentId(values[0]!)) return { kind: "invalid" };
  // URLSearchParams tolerates malformed percent escapes; targeted reads do not.
  try {
    for (const pair of search.replace(/^\?/u, "").split("&")) {
      const separator = pair.indexOf("=");
      const key = separator < 0 ? pair : pair.slice(0, separator);
      if (decodeURIComponent(key.replace(/\+/gu, " ")) === "comment") decodeURIComponent((separator < 0 ? "" : pair.slice(separator + 1)).replace(/\+/gu, " "));
    }
  } catch { return { kind: "invalid" }; }
  return { kind: "target", id: values[0]! };
}
export function withCommentSelector(path: string, id: string): string {
  if (!validCommentId(id)) throw new Error("invalid_comment_selector");
  return `${path}?comment=${encodeURIComponent(id)}`;
}
