export interface ApiAuthForwarder {
  headersForApi(request?: Request): Headers;
}

/**
 * M1 auth boundary. M2 will add the Privy session exchange at
 * /auth/session/exchange. Until then, forward only an explicit bearer token;
 * do not copy the browser cookie jar into an API subrequest.
 */
export function createStubApiAuthForwarder(): ApiAuthForwarder {
  return {
    headersForApi(request) {
      const headers = new Headers();
      const authorization = request?.headers.get("authorization");
      if (authorization) headers.set("authorization", authorization);
      return headers;
    },
  };
}
