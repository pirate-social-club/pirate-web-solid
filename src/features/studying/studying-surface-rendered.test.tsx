/* oxlint-disable anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion -- structural SSR primitives are isolated test adapters. */

import { afterAll, describe, expect, mock, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { renderToString, ssrElement } from "@solidjs/web";
import { createComponent } from "solid-js";

import type { StudyingSurfaceState } from "./studying-model";

const designSystemPath = new URL("../../design-system.ts", import.meta.url).pathname;
const jsxRuntimePath = new URL("../../../node_modules/@solidjs/web/types/jsx.d.ts", import.meta.url).pathname;

function element(tag: string, props: Record<string, unknown>) {
  const { children, class: className, ...rest } = props;
  return ssrElement(tag, { ...rest, ...(className ? { class: className } : {}) }, children, false);
}

const primitive = (tag: string) => (props: Record<string, unknown>) => element(tag, props);

mock.module(designSystemPath, () => ({
  Avatar: primitive("span"),
  Button: primitive("button"),
  Card: primitive("section"),
  CardContent: primitive("div"),
  CardHeader: primitive("header"),
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
  createMediaQuery: () => () => false,
  IconArrowsClockwise: primitive("svg"),
  IconCaretLeft: primitive("svg"),
  IconCheck: primitive("svg"),
  IconCheckCircle: primitive("svg"),
  IconCrown: primitive("svg"),
  IconFire: primitive("svg"),
  IconButton: primitive("button"),
  IconGift: primitive("svg"),
  IconLock: primitive("svg"),
  IconMicrophone: primitive("svg"),
  IconStop: primitive("svg"),
  IconWarningCircle: primitive("svg"),
  IconX: primitive("svg"),
  Spinner: primitive("span"),
  Type: (props: Record<string, unknown>) => element(String(props.as ?? "span"), props),
}));

mock.module(jsxRuntimePath, () => ({
  Fragment: (props: { children?: unknown }) => props.children,
  jsx: (type: unknown, props: Record<string, unknown>) => typeof type === "string" ? ssrElement(type, props, props.children, false) : createComponent(type as never, props),
  jsxs: (type: unknown, props: Record<string, unknown>) => typeof type === "string" ? ssrElement(type, props, props.children, false) : createComponent(type as never, props),
  jsxDEV: (type: unknown, props: Record<string, unknown>) => typeof type === "string" ? ssrElement(type, props, props.children, false) : createComponent(type as never, props),
}));

const { StudyingSurface } = await import("./studying-surface");

const wrongSpentState: StudyingSurfaceState = {
  kind: "say_it_back",
  attemptNumber: 2,
  exercise: { id: "exercise-1", lineNumber: 1, maxAttempts: 2, prompt: "Say this", expected: "Say this" },
  heardTranscript: "Something else",
  phase: "wrong",
  revealReference: true,
  willReturn: false,
};

const wrongRetryableState: StudyingSurfaceState = {
  ...wrongSpentState,
  revealReference: false,
};

const renderSurface = (state: StudyingSurfaceState) => renderToString(() => createComponent(StudyingSurface, {
  lessonProgress: { resolvedCount: 1, totalCount: 2 },
  state,
}));

describe("StudyingSurface rendered semantics", () => {
  test("uses the readable destructive token for final miss copy", () => {
    const html = renderSurface(wrongSpentState);

    expect(html).toContain("text-destructive-text");
    expect(html).toContain(">Incorrect</p>");
    expect(html).not.toContain("Let's come back to this");
    expect(html).not.toContain("You said:");
    expect(html).not.toContain("text-destructive\">");
  });

  test("makes the retryable miss action explicit without adding commentary", () => {
    const html = renderSurface(wrongRetryableState);

    expect(html).toContain(">Incorrect — try again</p>");
    expect(html).not.toContain("You said:");
  });

  test("keeps reduced-motion tracking delegated to the owned-write-safe helper", async () => {
    const source = await readFile(new URL("./studying-surface.tsx", import.meta.url), "utf8");

    expect(source).toContain('createMediaQuery("(prefers-reduced-motion: reduce)")');
    expect(source).not.toContain("window.matchMedia");
    expect(source).not.toContain("createSignal(false);\n\n  if (typeof window");
  });
});

afterAll(() => mock.restore());
