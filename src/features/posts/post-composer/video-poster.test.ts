import { describe, expect, test } from "bun:test";

import { dataUrlToBlob } from "./video-poster";

describe("dataUrlToBlob", () => {
  test("decodes a base64 image data URL without fetch", async () => {
    const blob = dataUrlToBlob("data:image/jpeg;base64,AQIDBA==", "image/jpeg");

    expect(blob.type).toBe("image/jpeg");
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([1, 2, 3, 4]);
  });

  test("decodes a URL-encoded data URL", async () => {
    const blob = dataUrlToBlob("data:text/plain,hello%20poster", "text/plain");

    expect(blob.type).toStartWith("text/plain");
    expect(await blob.text()).toBe("hello poster");
  });
});
