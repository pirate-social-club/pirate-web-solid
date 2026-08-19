import http from "node:http";

const base = process.env.SOLID_BASE_URL ?? "http://localhost:8787";

function get(path) {
  const url = new URL(path, base);
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: url.hostname, port: url.port, path: `${url.pathname}${url.search}` }, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode ?? 0,
        headers: new Headers(Object.entries(response.headers).flatMap(([key, value]) => value == null ? [] : [[key, Array.isArray(value) ? value.join(", ") : value]])),
        text: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    request.on("error", reject);
    request.end();
  });
}

const response = await get("/?hydration=1");
const csp = response.headers.get("content-security-policy") ?? "";
const nonce = csp.match(/nonce-([^']+)/)?.[1] ?? "";
const scripts = [...response.text.matchAll(/<script\b[^>]*>/gi)].map(match => match[0]);
const checks = [
  ["root responds 200", response.status === 200],
  ["root is SSR HTML", response.text.includes("Pirate Web Solid shell")],
  ["CSP has nonce", nonce.length > 0],
  ["CSP uses strict-dynamic", csp.includes("'strict-dynamic'")],
  ["CSP has no unsafe-eval", !csp.includes("unsafe-eval")],
  ["every SSR script carries nonce", scripts.every(script => script.includes(`nonce="${nonce}"`))],
  ["hydration control is present", response.text.includes('id="hydration-button"')],
  ["dialog fixture is SSR-marked", response.text.includes('id="hydration-dialog-open"')],
  ["form fixture is SSR-marked", response.text.includes('id="hydration-display-name"')],
];

for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
const failures = checks.filter(([, ok]) => !ok);
if (failures.length) process.exitCode = 1;
else console.log(`${checks.length}/${checks.length} checks passed`);
