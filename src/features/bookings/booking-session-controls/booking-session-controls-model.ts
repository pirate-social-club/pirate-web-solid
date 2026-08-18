export type AttendanceReportingHealth = "healthy" | "retrying" | "degraded";
export type BookingSessionControlsState = "in-session" | "ready-to-settle" | "settling" | "settled";

export function attendanceNotice(health: AttendanceReportingHealth): { tone: "warning" | "destructive"; title: string; detail: string } | null {
  if (health === "healthy") return null;
  if (health === "degraded") return {
    tone: "destructive",
    title: "Attendance reporting interrupted",
    detail: "Stay in the session while we retry. Your video call can continue.",
  };
  return {
    tone: "warning",
    title: "Reconnecting attendance reporting",
    detail: "Your presence is being retried automatically.",
  };
}

export function sessionLabel(counterpartyName: string): string {
  return `Session with ${counterpartyName}`;
}
