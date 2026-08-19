import { describe, expect, test } from "bun:test";

const mediaQueryModuleUrl = new URL(
  "../../../packages/solid-ui/src/lib/media-query.ts",
  import.meta.url,
).href;

describe("studying reduced-motion media query", () => {
  test("tracks a media change and cleans up the listener in the browser runtime", () => {
    const probe = `
      import { mock } from "bun:test";
      import * as solidBrowser from "solid-js/dist/solid.js";
      mock.module("solid-js", () => solidBrowser);
      const { createEffect, createRoot, flush } = await import("solid-js");
      const { createMediaQuery } = await import(${JSON.stringify(mediaQueryModuleUrl)});

      let matches = false;
      let listener;
      let removed = false;
      const media = {
        addEventListener(_type, next) { listener = next; },
        get matches() { return matches; },
        removeEventListener() { removed = true; },
      };
      globalThis.window = { matchMedia: () => media };

      const observed = [];
      const dispose = createRoot((rootDispose) => {
        const reducedMotion = createMediaQuery("(prefers-reduced-motion: reduce)");
        createEffect(
          () => reducedMotion(),
          (value) => { observed.push(value); },
        );
        flush();
        return rootDispose;
      });
      if (typeof listener !== "function") throw new Error("media listener was not installed");
      if (JSON.stringify(observed) !== "[false]") throw new Error("initial state: " + JSON.stringify(observed));
      matches = true;
      listener();
      flush();
      if (JSON.stringify(observed) !== "[false,true]") throw new Error("updated state: " + JSON.stringify(observed));
      dispose();
      if (!removed) throw new Error("media listener was not cleaned up");
      console.log(JSON.stringify({ observed, removed }));
    `;
    const result = Bun.spawnSync({
      cmd: [process.execPath, "--conditions", "browser", "-e", probe],
      stderr: "pipe",
      stdout: "pipe",
    });

    if (result.exitCode !== 0) {
      throw new Error(new TextDecoder().decode(result.stderr));
    }
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(new TextDecoder().decode(result.stdout).trim())).toEqual({
      observed: [false, true],
      removed: true,
    });
  });
});
