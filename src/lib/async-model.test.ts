import { describe, expect, test } from "bun:test";
import { renderToString } from "@solidjs/web";
import { createComponent, createMemo, Errored, isPending, Loading } from "solid-js";

function PendingRead() {
  const value = createMemo(async () => "ready");
  return value();
}

function FailingRead() {
  throw new Error("boom");
}

function SettledRead() {
  const value = createMemo(() => "ready");
  return `pending=${isPending(value)}:${value()}`;
}

describe("Solid async model boundaries", () => {
  test("renders the Loading fallback for an unresolved async read", () => {
    const html = renderToString(() => createComponent(Loading, {
      fallback: "loading",
      get children() { return createComponent(PendingRead, {}); },
    }));

    expect(html).toContain("loading");
  });

  test("exposes an Errored reset action for recovery", () => {
    let resetSeen = false;
    const html = renderToString(() => createComponent(Errored, {
      fallback: (error: () => Error, reset: () => void) => {
        resetSeen = typeof reset === "function";
        return `error=${error().message};retry`;
      },
      get children() { return createComponent(FailingRead, {}); },
    }));

    expect(html).toContain("error=boom;retry");
    expect(resetSeen).toBe(true);
  });

  test("reports a settled async computation as not pending", () => {
    const html = renderToString(() => createComponent(SettledRead, {}));

    expect(html).toContain("pending=false:ready");
  });
});
