import { getRequestEvent } from "@solidjs/web";
import { createApiClient, type ApiVersionResponse } from "./client";

export const apiVersionQueryKey = ["api", "version"] as const;

export function createApiVersionQuery(request?: Request) {
  const serverRequest = request ?? getRequestEvent()?.request;
  return {
    queryKey: apiVersionQueryKey,
    queryFn: async (): Promise<ApiVersionResponse> =>
      createApiClient({ request: serverRequest }).getVersion(),
    staleTime: 60_000,
    retry: false,
    throwOnError: false,
  };
}
