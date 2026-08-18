import type { IanaTz, IsoInstant } from "../view-models";

export interface CalendarEventData {
  bookingTitle: string;
  hostName: string;
  startUtc: IsoInstant;
  endUtc: IsoInstant;
  viewerTimezone: IanaTz;
}

/** Format an ISO UTC instant using the iCalendar UTC date-time form. */
function formatIcsTimestamp(utcIso: IsoInstant): string {
  return utcIso.replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "");
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Fold content lines at the RFC 5545 75-octet limit without splitting UTF-8 or escapes. */
function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const codePoints = Array.from(line);
  let folded = "";
  let lineBytes = 0;
  let firstLine = true;

  for (let index = 0; index < codePoints.length;) {
    let token = codePoints[index]!;
    index += 1;
    if (token === "\\" && index < codePoints.length) {
      token += codePoints[index]!;
      index += 1;
    }

    const tokenBytes = encoder.encode(token).byteLength;
    const maxBytes = firstLine ? 75 : 74;
    if (lineBytes > 0 && lineBytes + tokenBytes > maxBytes) {
      folded += "\r\n ";
      lineBytes = 0;
      firstLine = false;
    }
    folded += token;
    lineBytes += tokenBytes;
  }

  return folded;
}

/** Build the deterministic event payload used by the browser download. */
export function buildIcs(props: CalendarEventData, now = new Date()): string {
  const title = escapeIcsText(`${props.bookingTitle} with ${props.hostName}`);
  const description = escapeIcsText(
    `1:1 video session with ${props.hostName}. Times shown in ${props.viewerTimezone}.`,
  );
  const uid = escapeIcsText(`${props.startUtc}-${props.hostName}@pirate.sc`);

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pirate//Bookings//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatIcsTimestamp(now.toISOString())}`,
    `DTSTART:${formatIcsTimestamp(props.startUtc)}`,
    `DTEND:${formatIcsTimestamp(props.endUtc)}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].map(foldIcsLine).join("\r\n") + "\r\n";
}

/**
 * Start a calendar download only when invoked in a browser event handler.
 * Keeping all browser globals inside this function makes module import and SSR safe.
 */
export function triggerDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  let link: HTMLAnchorElement | undefined;
  let appended = false;
  let actionFailed = false;
  let cleanupError: unknown;

  try {
    link = document.createElement("a");
    link.href = url;
    link.download = filename;
    // Mark this before the call so a custom DOM implementation that inserts
    // the node and then throws still gets a removal attempt in cleanup.
    appended = true;
    document.body.appendChild(link);
    link.click();
  } catch (error) {
    actionFailed = true;
    throw error;
  } finally {
    if (link && appended) {
      try {
        document.body.removeChild(link);
      } catch (error) {
        cleanupError = error;
      }
    }

    try {
      URL.revokeObjectURL(url);
    } catch (error) {
      cleanupError ??= error;
    }

    // A click/DOM error is the useful failure. Cleanup must not hide it; if
    // the action succeeded, surface a cleanup failure instead.
    if (!actionFailed && cleanupError !== undefined) throw cleanupError;
  }
}
