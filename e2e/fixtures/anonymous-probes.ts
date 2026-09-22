export type ProbeResponse = Readonly<{ status: number; method: string; path: string }>;

/** Persona resolution is concurrent with the account probe, not a second login. */
export function isAnonymousSessionProbe(entry: ProbeResponse, responses: readonly ProbeResponse[]): boolean {
  if (entry.status !== 401 || entry.method !== "GET") return false;
  if (entry.path === "/api/users/me") return true;
  return entry.path === "/api/personas" && responses.some(response =>
    response.path === "/api/users/me" && response.method === "GET" && response.status === 401);
}
