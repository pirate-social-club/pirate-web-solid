import { expect, test } from "bun:test";

import { readFileSync } from "node:fs";

const source = (name: string) =>
  readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("wallet hub keeps a valid heading hierarchy after the accepted review recovery", () => {
  const hub = source("wallet-hub.tsx");

  expect(hub).not.toContain("<CardTitle>");
  expect(hub).toContain('<Type variant="h2" as="h1">{view().title}</Type>');
  expect(hub).toContain('<Type as="h2" variant="h3">Assets</Type>');
  expect(hub).toContain('<Type as="h2" variant="h3">Recent activity</Type>');
});

test("wallet send keeps the accepted bounded and terminal interaction semantics", () => {
  const send = source("wallet-send-sheet.tsx");

  expect(send).toContain("max-h-[88dvh]");
  expect(send).toContain("max-h-[min(48dvh,24rem)]");
  expect(send).toContain("overflow-y-auto");
  expect(send).toContain("tabindex={0}");
  expect(send).toContain('aria-live="polite"');
  expect(send).toContain('role="status"');
  expect(send).toContain('aria-live="assertive"');
  expect(send).toContain('role="alert"');
  expect(send).toContain(">Retry</Button>");
  expect(send).toContain("setSubmitAttempted(false)");
});

test("wallet send and receive reset props through tracked effects", () => {
  const send = source("wallet-send-sheet.tsx");
  const receive = source("wallet-receive-sheet.tsx");

  expect(send).toContain("amount: props.amount");
  expect(send).toContain("defaultAsset: defaultAsset()");
  expect(send).toContain("open: props.open");
  expect(send).toContain('setLocalStep(next.step ?? "asset")');
  expect(receive).toContain("chainSections: props.chainSections");
  expect(receive).toContain("defaultChainId: props.defaultChainId");
  expect(receive).toContain("walletAddress: props.walletAddress");
  expect(receive).toContain("setCopied(false)");
});

test("wallet send full-flow play queries the portaled modal", () => {
  const story = readFileSync(new URL("./wallet-send-sheet/wallet-send-sheet.stories.tsx", import.meta.url), "utf8");

  expect(story).toContain('findByRole("dialog", { name: "Send" })');
  expect(story).toContain("within(dialog).getByPlaceholderText");
  expect(story).toContain('within(dialog).getByRole("button", { name: "Send" })');
  expect(story).not.toContain("within(canvasElement)");
});
