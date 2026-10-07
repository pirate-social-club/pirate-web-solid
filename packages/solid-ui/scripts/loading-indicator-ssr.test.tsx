import { renderToString } from "@solidjs/web";
import { expect, test } from "vitest";
import { LoadingIndicator } from "../src/components/feedback/loading-indicator/loading-indicator";

test("loading pages render a single named status and a decorative spinner on the server", () => {
  const html = renderToString(() => <main><LoadingIndicator label="Loading community" variant="page" /></main>);
  expect(html.match(/role="status"/g)).toHaveLength(1);
  expect(html).toContain('aria-label="Loading community"');
  expect(html).toContain('aria-hidden="true"');
  expect(html).not.toContain('>Loading community<');
});
