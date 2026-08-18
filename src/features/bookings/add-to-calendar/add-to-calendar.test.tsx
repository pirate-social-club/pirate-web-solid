import { afterEach, describe, expect, test } from "bun:test";

import { buildIcs, triggerDownload } from "./calendar-file";

const props = {
  bookingTitle: "English, Conversation; Practice",
  hostName: "Amira\\Hassan",
  startUtc: "2026-07-01T07:00:00.000Z",
  endUtc: "2026-07-01T07:30:00.000Z",
  viewerTimezone: "Europe/Vienna",
} as const;

const nativeDescriptors = {
  Blob: Object.getOwnPropertyDescriptor(globalThis, "Blob"),
  Date: Object.getOwnPropertyDescriptor(globalThis, "Date"),
  URL: Object.getOwnPropertyDescriptor(globalThis, "URL"),
  document: Object.getOwnPropertyDescriptor(globalThis, "document"),
};

function restoreGlobal(name: keyof typeof nativeDescriptors) {
  const descriptor = nativeDescriptors[name];
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else delete (globalThis as Record<string, unknown>)[name];
}

afterEach(() => {
  restoreGlobal("Date");
  restoreGlobal("Blob");
  restoreGlobal("document");
  restoreGlobal("URL");
});

describe("AddToCalendar", () => {
  test("builds the event without reading browser globals, so SSR can import it", () => {
    const fixedNow = new Date("2026-06-30T12:34:56.000Z");
    const ics = buildIcs(props, fixedNow);
    const unfolded = ics.replace(/\r\n /g, "");

    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
    expect(unfolded).toContain("DTSTAMP:20260630T123456Z");
    expect(unfolded).toContain("DTSTART:20260701T070000Z");
    expect(unfolded).toContain("DTEND:20260701T073000Z");
    expect(unfolded).toContain("UID:2026-07-01T07:00:00.000Z-Amira\\\\Hassan@pirate.sc");
    expect(unfolded).toContain("SUMMARY:English\\, Conversation\\; Practice with Amira\\\\Hassan");
    expect(unfolded).toContain("DESCRIPTION:1:1 video session with Amira\\\\Hassan. Times shown in Europe/Vienna.");
  });

  test("escapes every dynamic UID delimiter without adding raw content lines", () => {
    const ics = buildIcs({
      ...props,
      hostName: "Amira\\Hassan,Partner;North\r\nRoom",
      bookingTitle: "Review\nnotes",
      viewerTimezone: "Europe/Vienna\rBackup",
    }, new Date("2026-06-30T12:34:56.000Z"));
    const unfolded = ics.replace(/\r\n /g, "");

    expect(unfolded).toContain("UID:2026-07-01T07:00:00.000Z-Amira\\\\Hassan\\,Partner\\;North\\nRoom@pirate.sc");
    expect(unfolded).toContain("SUMMARY:Review\\nnotes with Amira\\\\Hassan\\,Partner\\;North\\nRoom");
    expect(unfolded).toContain("DESCRIPTION:1:1 video session with Amira\\\\Hassan\\,Partner\\;North\\nRoom. Times shown in Europe/Vienna\\nBackup.");
    expect(ics).not.toMatch(/(?:^|\r?\n)(?:Room|Backup|notes)(?:\r?\n|$)/);
    expect(ics.split("\r\n").join("")).not.toContain("\n");
  });

  test("folds long dynamic fields without splitting UTF-8 or escaped text", () => {
    const ics = buildIcs({
      ...props,
      hostName: `${"Amira ".repeat(24)}\\Hassan,Partner;North`,
    }, new Date("2026-06-30T12:34:56.000Z"));
    const contentLines = ics.split("\r\n");

    expect(contentLines.some((line) => line.startsWith(" "))).toBe(true);
    expect(contentLines.every((line) => new TextEncoder().encode(line).byteLength <= 75)).toBe(true);
    expect(ics.replace(/\r\n /g, "")).toContain("Amira Amira ");
    expect(ics.replace(/\r\n /g, "")).toContain("\\\\Hassan\\,Partner\\;North");
  });

  test("uses the current clock and browser Blob/URL APIs for a download", () => {
    const fixedNow = "2026-06-30T12:34:56.000Z";
    const NativeDate = globalThis.Date;
    class FixedDate extends NativeDate {
      constructor(value?: string | number | Date) {
        super(value === undefined ? fixedNow : value instanceof NativeDate ? value.getTime() : value);
      }

      static now() {
        return NativeDate.parse(fixedNow);
      }
    }

    const blobs: Array<{ parts: unknown[]; type: string }> = [];
    class TestBlob {
      readonly parts: unknown[];
      readonly type: string;

      constructor(parts: unknown[], options?: { type?: string }) {
        this.parts = parts;
        this.type = options?.type ?? "";
        blobs.push(this);
      }
    }

    const links: Array<{ href: string; download: string; clicked: boolean }> = [];
    const operations: string[] = [];
    const revokedUrls: string[] = [];
    const fakeDocument = {
      body: {
        appendChild(link: { href: string; download: string; click: () => void }) {
          operations.push("append");
          links.push({ href: link.href, download: link.download, clicked: false });
        },
        removeChild() {
          operations.push("remove");
        },
      },
      createElement() {
        const link = {
          href: "",
          download: "",
          click() {
            operations.push("click");
            const saved = links.at(-1);
            if (saved) saved.clicked = true;
          },
        };
        return link;
      },
    };
    const fakeUrl = {
      createObjectURL(blob: unknown) {
        expect(blob).toBe(blobs[0]);
        return "blob:calendar-test";
      },
      revokeObjectURL(url: string) {
        revokedUrls.push(url);
      },
    };

    Object.defineProperty(globalThis, "Date", { configurable: true, writable: true, value: FixedDate });
    Object.defineProperty(globalThis, "Blob", { configurable: true, writable: true, value: TestBlob });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      writable: true,
      value: fakeDocument,
    });
    Object.defineProperty(globalThis, "URL", { configurable: true, writable: true, value: fakeUrl });

    const ics = buildIcs(props);
    triggerDownload(ics, "pirate-booking-20260701.ics");

    expect(blobs).toHaveLength(1);
    expect(blobs[0]?.type).toBe("text/calendar;charset=utf-8");
    expect(String(blobs[0]?.parts[0])).toContain("DTSTAMP:20260630T123456Z");
    expect(links).toEqual([
      { href: "blob:calendar-test", download: "pirate-booking-20260701.ics", clicked: true },
    ]);
    expect(operations).toEqual(["append", "click", "remove"]);
    expect(revokedUrls).toEqual(["blob:calendar-test"]);
  });

  test("removes the link and revokes the URL when clicking throws", () => {
    const blobs: unknown[] = [];
    class TestBlob {
      constructor(parts: unknown[]) {
        blobs.push(parts[0]);
      }
    }

    const operations: string[] = [];
    const revokedUrls: string[] = [];
    const clickError = new Error("download click failed");
    const fakeDocument = {
      body: {
        appendChild() {
          operations.push("append");
        },
        removeChild() {
          operations.push("remove");
          throw new Error("link cleanup failed");
        },
      },
      createElement() {
        return {
          href: "",
          download: "",
          click() {
            operations.push("click");
            throw clickError;
          },
        };
      },
    };
    const fakeUrl = {
      createObjectURL(blob: unknown) {
        expect(blob).toBeInstanceOf(TestBlob);
        return "blob:calendar-throw";
      },
      revokeObjectURL(url: string) {
        operations.push("revoke");
        revokedUrls.push(url);
        throw new Error("URL cleanup failed");
      },
    };

    Object.defineProperty(globalThis, "Blob", { configurable: true, writable: true, value: TestBlob });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      writable: true,
      value: fakeDocument,
    });
    Object.defineProperty(globalThis, "URL", { configurable: true, writable: true, value: fakeUrl });

    expect(() => triggerDownload("BEGIN:VCALENDAR\r\nEND:VCALENDAR", "booking.ics")).toThrow(clickError);
    expect(blobs).toHaveLength(1);
    expect(operations).toEqual(["append", "click", "remove", "revoke"]);
    expect(revokedUrls).toEqual(["blob:calendar-throw"]);
  });
});
