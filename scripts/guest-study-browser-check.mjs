// Owned local HTTPS/component/native-browser gate. No remote product/API traffic.
import { spawn, execFile } from "node:child_process";
import { once } from "node:events";
import { createServer as httpServer, request as httpRequest } from "node:http";
import { createServer as httpsServer } from "node:https";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const runId = randomBytes(16).toString("hex");
const owned = await mkdtemp(join(tmpdir(), "pirate-guest-browser-"));
const results = join(appRoot, ".tmp", `guest-study-browser-${runId}`);
const children = [], logs = [];
let proxy, reservation, primary, failed = false;
const cleanup = [];
function bounded(promise, milliseconds, label) {
  let timer;
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label)), milliseconds); });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}
function child(args, env) {
  const process = spawn("bun", args, { cwd: appRoot, env: { ...globalThis.process.env, ...env },
    detached: true, stdio: ["ignore", "pipe", "pipe"] });
  children.push(process);
  const append = chunk => { logs.push(chunk.toString()); while (logs.join("").length > 64 * 1024) logs.shift(); };
  process.stdout.on("data", append); process.stderr.on("data", append);
  // Registration observes spawn failures immediately; each awaited use also checks exit.
  process.on("error", error => { process.ownedSpawnError = error; });
  return process;
}
async function stop(process) {
  if (process.pid === undefined || process.exitCode !== null || process.signalCode !== null) return;
  const exit = once(process, "exit");
  try { globalThis.process.kill(-process.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
  try { await bounded(exit, 3_000, "Owned child TERM deadline"); }
  catch {
    try { globalThis.process.kill(-process.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
    await bounded(exit, 3_000, "Owned child KILL deadline");
  }
}
try {
  // Disposable local TLS material. Never exported, provisioned or printed.
  const keyPath = join(owned, "tls.key"), certPath = join(owned, "tls.crt");
  await promisify(execFile)("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
    "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1",
    "-keyout", keyPath, "-out", certPath], { timeout: 10_000 });
  reservation = httpServer();
  await new Promise((resolve, reject) => { reservation.once("error", reject); reservation.listen(0, "127.0.0.1", resolve); });
  const address = reservation.address();
  if (address === null || typeof address === "string") throw new Error("Owned loopback port missing");
  const vitePort = address.port;
  await new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
  reservation = undefined;
  const vite = child(["x", "vite", "--config", "e2e/fixtures/guest-study-browser/vite.config.ts", "--port", String(vitePort)],
    { NO_COLOR: "1", GUEST_STUDY_BROWSER_RUN_ID: runId });
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (vite.ownedSpawnError) throw vite.ownedSpawnError;
    if (vite.exitCode !== null || vite.signalCode !== null) throw new Error("Owned Vite process exited before admission");
    try {
      const response = await fetch(`http://127.0.0.1:${vitePort}/__guest_study_browser_health`, { signal: AbortSignal.timeout(500) });
      const body = await response.json();
      if (response.ok && body.runId === runId) { ready = true; break; }
    } catch { /* Readiness only; identity must still match the exact owned process. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error("Owned Vite readiness deadline");
  proxy = httpsServer({ key: await readFile(keyPath), cert: await readFile(certPath) }, (request, response) => {
    const upstream = httpRequest({ hostname: "127.0.0.1", port: vitePort, path: request.url, method: request.method,
      agent: false, headers: { ...request.headers, host: `127.0.0.1:${vitePort}` } }, incoming => {
      response.writeHead(incoming.statusCode ?? 502, incoming.headers); incoming.pipe(response);
    });
    upstream.on("error", () => { if (!response.headersSent) response.writeHead(502); response.end(); });
    request.on("aborted", () => upstream.destroy()); request.pipe(upstream);
  });
  await new Promise((resolve, reject) => { proxy.once("error", reject); proxy.listen(0, "127.0.0.1", resolve); });
  const tls = proxy.address();
  if (tls === null || typeof tls === "string") throw new Error("Owned HTTPS address missing");
  await mkdir(results, { recursive: true });
  const browser = child(["x", "playwright", "test", "--config", "e2e/guest-study-browser.config.ts"], {
    NO_COLOR: "1", GUEST_STUDY_BROWSER_ORIGIN: `https://127.0.0.1:${tls.port}`,
    GUEST_STUDY_BROWSER_RESULTS: results,
  });
  const [exitCode, signal] = await bounded(once(browser, "exit"), 240_000, "Owned browser gate deadline");
  if (browser.ownedSpawnError) throw browser.ownedSpawnError;
  if (exitCode !== 0 || signal !== null) throw new Error(`Owned browser gate failed: exit=${exitCode} signal=${signal}`);
} catch (error) { failed = true; primary = error; }
finally {
  // Independent cleanup attempts preserve the original assertion as well as every failure.
  for (const process of [...children].reverse()) {
    try { await stop(process); } catch (error) { cleanup.push(error); }
  }
  if (reservation?.listening) {
    try {
      reservation.closeAllConnections();
      await bounded(new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve())), 3_000, "Owned port reservation close deadline");
    } catch (error) { cleanup.push(error); }
  }
  if (proxy !== undefined) {
    try {
      proxy.closeAllConnections();
      await bounded(new Promise((resolve, reject) => proxy.close(error => error ? reject(error) : resolve())), 3_000, "Owned TLS close deadline");
    } catch (error) { cleanup.push(error); }
  }
  try { await rm(owned, { recursive: true, force: true }); } catch (error) { cleanup.push(error); }
}
if (failed || cleanup.length > 0) {
  process.stderr.write(logs.join(""));
  throw new AggregateError(failed ? [primary, ...cleanup] : cleanup, "Owned guest browser gate failed; no acceptance credit");
}
process.stdout.write(logs.join(""));
console.log(JSON.stringify({ ok: true, scope: "Chromium native IndexedDB/WebLock with API boundary mock", cases: 5,
  https: true, childrenExited: true, localTlsRemoved: true, nativeApiProviderDeviceHnsStagingAccepted: false }));
