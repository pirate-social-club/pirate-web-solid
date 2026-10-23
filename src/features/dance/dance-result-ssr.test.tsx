import { expect, test, vi } from "vitest";
import { renderToString } from "@solidjs/web";
import { DanceResultPage } from "./dance-result-page.tsx";

test("server output is only a loading shell and performs no private session or result read", () => {
  const read = vi.fn(), session = vi.fn();
  const html = renderToString(() => <DanceResultPage communityId="private-community" reviewId="private-review" api={{ read }} session={session} />);
  expect(html).toContain("Loading your dance result");
  expect(html).not.toMatch(/private-community|private-review|qualification_ref|Passed/u);
  expect(read).not.toHaveBeenCalled();
  expect(session).not.toHaveBeenCalled();
});
