import { createStubApiAuthForwarder, type ApiAuthForwarder } from "./auth-forwarding";
import { resolveApiUrl } from "./request-origin";

export interface ApiVersionResponse {
  service: string;
  environment?: string;
  api_origin?: string;
  version?: string;
  commit?: string;
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly pathname: string;

  constructor(status: number, pathname: string) {
    super(`API request failed (${status}) for ${pathname}`);
    this.name = "ApiRequestError";
    this.status = status;
    this.pathname = pathname;
  }
}

export function assertApiResponse(response: Response, pathname: string): void {
  if (!response.ok) throw new ApiRequestError(response.status, pathname);
}

export interface ApiClientOptions {
  request?: Request;
  fetchImpl?: typeof fetch;
  authForwarder?: ApiAuthForwarder;
  timeoutMs?: number;
}

export function createApiClient(options: ApiClientOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const authForwarder = options.authForwarder ?? createStubApiAuthForwarder();
  const timeoutMs = options.timeoutMs ?? 4_000;

  async function getJson<T>(pathname: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(resolveApiUrl(pathname, options.request), {
        headers: authForwarder.headersForApi(options.request),
        signal: controller.signal,
      });
      assertApiResponse(response, pathname);
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    getJson,
    getVersion: () => getJson<ApiVersionResponse>("/__version"),
  };
}

export function isApiRequestError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError;
}
