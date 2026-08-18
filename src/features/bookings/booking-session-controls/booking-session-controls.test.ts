import { describe, expect, test } from "bun:test";

import { attendanceNotice, sessionLabel } from "./booking-session-controls-model";

describe("booking session controls model", () => {
  test("distinguishes retrying from degraded attendance", () => {
    expect(attendanceNotice("healthy")).toBeNull();
    expect(attendanceNotice("retrying")).toMatchObject({ tone: "warning" });
    expect(attendanceNotice("degraded")).toMatchObject({ tone: "destructive" });
  });

  test("fills the counterparty label without a timer or network dependency", () => {
    expect(sessionLabel("Amira Hassan")).toBe("Session with Amira Hassan");
  });
});
