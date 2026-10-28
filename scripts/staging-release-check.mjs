const appOrigin = "https://web-next-staging.pirate.sc";
const apiOrigin = "https://api-next-staging.pirate.sc";

/** Read-only, anonymous checks of the actual app, its bundle and both API paths. */
export async function checkDirectStaging(fetcher = fetch) {
  async function get(url, contentType, status = 200) {
    const response = await fetcher(url, {
      redirect: "error", credentials: "omit", signal: AbortSignal.timeout(15_000),
    });
    if (response.status !== status || !response.headers.get("content-type")?.includes(contentType)) {
      throw new Error(`staging_direct_check_failed:${new URL(url).pathname}`);
    }
    return response;
  }
  const html = await (await get(`${appOrigin}/`, "text/html")).text();
  const entry = html.match(/<script\b[^>]*\bsrc="(\/assets\/entry-client-[^"?#]+\.js)"/u)?.[1];
  if (!html.includes('id="app-root"') || !entry) throw new Error("staging_direct_app_missing");
  const bundle = await get(new URL(entry, appOrigin).href, "javascript");
  if (!(await bundle.text()).trim()) throw new Error("staging_direct_bundle_empty");
  for (const url of [`${apiOrigin}/health`, `${appOrigin}/api/health`]) {
    if ((await (await get(url, "application/json")).json())?.status !== "ok") {
      throw new Error("staging_direct_api_unhealthy");
    }
  }
  const anonymous = await get(`${appOrigin}/api/users/me`, "application/json", 401);
  if ((await anonymous.json())?.error?.code !== "auth_error") {
    throw new Error("staging_direct_auth_boundary_failed");
  }
  return { origin: appOrigin, apiOrigin, entry };
}

/** HNS acceptance stays strict; ordinary staging release reports it separately. */
export async function checkStagingRelease({ directCheck = checkDirectStaging, hnsCheck, requireHns, report }) {
  const direct = await directCheck();
  report({ event: "staging_direct_check_passed", ...direct });
  try {
    await hnsCheck();
  } catch {
    report({ event: "staging_hns_availability", status: "failed", required: requireHns });
    if (requireHns) throw new Error("staging_hns_acceptance_failed");
    return { direct: "passed", hns: "failed" };
  }
  report({ event: "staging_hns_availability", status: "passed", required: requireHns });
  return { direct: "passed", hns: "passed" };
}
