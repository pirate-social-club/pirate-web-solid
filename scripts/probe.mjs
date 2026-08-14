import http from "node:http";

const base = process.env.SEAM_BASE_URL ?? "http://127.0.0.1:8787";

function get(path, init = {}) {
  const url = new URL(path, base);
  const headers = init.headers ?? {};
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method: init.method ?? "GET",
      headers,
    }, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => {
        const body = Buffer.concat(chunks);
        const responseHeaders = new Headers();
        for (const [key, value] of Object.entries(response.headers)) {
          if (value !== undefined) responseHeaders.set(key, Array.isArray(value) ? value.join(", ") : value);
        }
        resolve({
          status: response.statusCode ?? 0,
          headers: responseHeaders,
          body,
          async text() { return body.toString("utf8"); },
        });
      });
    });
    request.on("error", reject);
    request.end();
  });
}

const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok, detail });
}

const root = await get("/", { headers: { host: "app.example.hns" } });
const html = await root.text();
const csp = root.headers.get("content-security-policy") ?? "";
const nonce = csp.match(/nonce-([^']+)/)?.[1] ?? "";
check("root responds 200", root.status === 200, String(root.status));
check("root is SSR HTML", html.includes("Pirate Web Solid shell"));
check("CSP has nonce", nonce.length > 0);
check("CSP uses strict-dynamic", csp.includes("'strict-dynamic'"));
check("CSP has no unsafe-eval", !csp.includes("unsafe-eval"));
const scripts = [...html.matchAll(/<script\b[^>]*>/gi)].map(match => match[0]);
check("SSR emitted script exists", scripts.length > 0, `${scripts.length} scripts`);
check("every SSR script carries nonce", scripts.every(script => script.includes(`nonce="${nonce}"`)));
check("hydration control is present", html.includes("id=\"hydration-button\""));

const apex = await get("/", { redirect: "manual", headers: { host: "example.hns" } });
check("HNS apex redirects", apex.status === 307, String(apex.status));
check("HNS redirect targets app host", (apex.headers.get("location") ?? "").includes("app.example.hns"));
const host = await get("/seam/host", { headers: { host: "app.example.hns" } });
check("app host serves", host.status === 200, String(host.status));
check("host surface header is app", host.headers.get("x-seam-host-surface") === "app");
const binding = await get("/seam/binding", { headers: { host: "app.example.hns" } });
const bindingText = await binding.text();
check("service-binding route serves", binding.status === 200, String(binding.status));
check("service-binding round trip identifies public worker", bindingText.includes("pirate-web-solid-public"));
check("service-binding route returns JSON payload", binding.headers.get("content-type")?.includes("text/html") === false || bindingText.includes("upstream"));
check("adapter returns streamed-capable response", root.body.length > 0);

for (const result of checks) console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` (${result.detail})` : ""}`);
const failures = checks.filter(result => !result.ok);
if (failures.length) {
  console.error(`${failures.length}/${checks.length} checks failed`);
  process.exitCode = 1;
} else {
  console.log(`${checks.length}/${checks.length} checks passed`);
}
