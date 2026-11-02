import { expect, test } from "playwright/test";
import { assertStablePostingControl } from "./fixtures/publish-song.ts";

test("@local-fixture accepts continuously available posting controls", async ({ page }) => {
  await page.setContent('<button>Next</button>');
  await assertStablePostingControl(page.getByRole("button", { name: "Next" }), 100);
});

for (const attribute of ["disabled", "aria-busy"] as const) {
  test(`@local-fixture rejects brief ${attribute} transitions between samples`, async ({ page }) => {
    await page.setContent('<button>Next</button>');
    await page.evaluate(name => {
      const button = document.querySelector("button")!;
      setInterval(() => {
        button.setAttribute(name, name === "disabled" ? "" : "true");
        button.removeAttribute(name);
      }, 10);
    }, attribute);
    await expect(assertStablePostingControl(page.getByRole("button", { name: "Next" }), 100)).rejects.toThrow();
  });
}
