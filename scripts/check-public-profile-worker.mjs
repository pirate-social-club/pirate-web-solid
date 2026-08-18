import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const workerModule = await import(`${pathToFileURL(new URL("../dist/ssr/index.js", import.meta.url).pathname)}?profile-check=${Date.now()}`);
const worker = workerModule.default;
const originalFetch = globalThis.fetch;
const apiOrigin = "http://127.0.0.1:8788";
const secretMarkers = ["cookie-secret", "bearer-secret", "csrf-secret", "profile-opaque-id", "opaque-avatar", "raw-upstream-secret"];

const profile = ({ requested = "captain-one.pirate", canonical = true } = {}) => ({
  profile: {
    id: "profile-opaque-id",
    object: "profile",
    display_name: "Captain One",
    avatar_ref: "opaque-avatar",
    avatar_source: "upload",
    cover_ref: null,
    cover_source: null,
    bio: "Sail safely.",
    bio_source: "manual",
    preferred_locale: "en",
    global_handle: {
      id: "handle-opaque-id",
      object: "global_handle",
      label: "captain-one.pirate",
      status: "active",
    },
    created: 1_700_000_000,
  },
  requested_handle_label: requested,
  resolved_handle_label: "captain-one.pirate",
  is_canonical: canonical,
  created_communities: [{
    community: "community-opaque-id",
    display_name: "Harbor",
    created: 1_700_000_001,
    route_slug: "harbor",
  }],
});

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
});

async function requestProfile(path, upstream) {
  let calls = 0;
  let settledAt = 0;
  globalThis.fetch = async (input, init) => {
    calls += 1;
    const url = new URL(input instanceof Request ? input.url : input.toString());
    assert.equal(url.origin, apiOrigin);
    assert.equal(init?.credentials, "omit");
    const headers = new Headers(init?.headers);
    assert.equal(headers.has("cookie"), false);
    assert.equal(headers.has("authorization"), false);
    assert.equal(headers.has("x-csrf-token"), false);
    await new Promise(resolve => setTimeout(resolve, 60));
    settledAt = performance.now();
    return upstream(url);
  };

  const startedAt = performance.now();
  const response = await worker.fetch(new Request(`https://pirate.test${path}`, {
    headers: {
      cookie: "session=cookie-secret",
      authorization: "Bearer bearer-secret",
      "x-csrf-token": "csrf-secret",
      "accept-language": "ar",
    },
  }), { API_NEXT_ORIGIN: apiOrigin });
  const returnedAt = performance.now();
  if (calls > 0) assert.ok(returnedAt >= settledAt, "Worker returned before profile preflight settled");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("vary"), "Accept-Language");
  return { response, calls, startedAt, returnedAt };
}

try {
  const canonical = await requestProfile("/u/captain-one?lang=ar", url => {
    assert.equal(url.pathname, "/public-profiles/captain-one");
    return json(profile());
  });
  assert.equal(canonical.calls, 1);
  assert.equal(canonical.response.status, 200);
  assert.ok(canonical.returnedAt - canonical.startedAt >= 50, "delayed preflight was not awaited");
  const canonicalReader = canonical.response.body.getReader();
  const firstCanonicalChunk = await canonicalReader.read();
  assert.equal(firstCanonicalChunk.done, false);
  const firstHtml = new TextDecoder().decode(firstCanonicalChunk.value);
  assert.match(firstHtml, /<html[^>]* lang="ar" dir="rtl">/u);
  assert.match(firstHtml, /data-profile-state="success"/u);
  assert.doesNotMatch(firstHtml, /data-profile-state="loading"/u);
  let canonicalHtml = firstHtml;
  while (true) {
    const chunk = await canonicalReader.read();
    if (chunk.done) break;
    canonicalHtml += new TextDecoder().decode(chunk.value);
  }
  for (const marker of secretMarkers) assert.equal(canonicalHtml.includes(marker), false, `leaked ${marker}`);

  const encoded = await requestProfile("/u/captain%2Done", url => {
    assert.equal(url.pathname, "/public-profiles/captain-one");
    return json(profile());
  });
  assert.equal(encoded.calls, 1);
  assert.equal(encoded.response.status, 200);
  assert.match(await encoded.response.text(), /data-profile-state="success"/u);

  const invalid = await requestProfile("/u/bad_handle", () => {
    throw new Error("invalid handles must not call api-next");
  });
  assert.equal(invalid.calls, 0);
  assert.equal(invalid.response.status, 400);
  const invalidHtml = await invalid.response.text();
  assert.match(invalidHtml, /data-profile-state="invalid"/u);

  const missing = await requestProfile("/u/missing", url => {
    assert.equal(url.pathname, "/public-profiles/missing");
    return json({ error: { code: "not_found", message: "raw-upstream-secret", retryable: false } }, 404);
  });
  assert.equal(missing.calls, 1);
  assert.equal(missing.response.status, 404);
  assert.equal((await missing.response.text()).includes("raw-upstream-secret"), false);

  const broken = await requestProfile("/u/broken", url => {
    assert.equal(url.pathname, "/public-profiles/broken");
    return new Response("raw-upstream-secret", { status: 500 });
  });
  assert.equal(broken.calls, 1);
  assert.equal(broken.response.status, 502);
  assert.equal((await broken.response.text()).includes("raw-upstream-secret"), false);

  const alias = await requestProfile("/u/old-name", url => {
    assert.equal(url.pathname, "/public-profiles/old-name");
    return json(profile({ requested: "old-name.pirate", canonical: false }));
  });
  assert.equal(alias.calls, 1);
  assert.equal(alias.response.status, 302);
  assert.equal(alias.response.headers.get("location"), "https://pirate.test/u/captain-one.pirate");
  assert.equal(await alias.response.text(), "");

  console.log(JSON.stringify({
    canonical: { status: 200, calls: canonical.calls },
    encoded: { status: 200, calls: encoded.calls },
    invalid: { status: 400, calls: invalid.calls },
    missing: { status: 404, calls: missing.calls },
    broken: { status: 502, calls: broken.calls },
    alias: { status: 302, calls: alias.calls },
  }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
}
