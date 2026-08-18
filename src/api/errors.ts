/**
 * The proxy never forwards implementation errors to the browser.  These
 * small constructors keep locally generated failures in api-next's v2 wire
 * envelope without importing api-next's runtime or error package.
 */
export type ApiTransportErrorCode =
  | "bad_request"
  | "internal_error"
  | "provider_unavailable";

export class ApiTransportError extends Error {
  readonly code: ApiTransportErrorCode;
  readonly status: number;
  readonly retryable: boolean;

  constructor(
    code: ApiTransportErrorCode,
    status: number,
    retryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = "ApiTransportError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

export const badRequest = (message = "Invalid request"): ApiTransportError =>
  new ApiTransportError("bad_request", 400, false, message);

export const internalError = (message = "Internal server error"): ApiTransportError =>
  new ApiTransportError("internal_error", 500, true, message);

export const upstreamUnavailable = (): ApiTransportError =>
  new ApiTransportError("provider_unavailable", 502, true, "API unavailable");

export interface ApiErrorEnvelope {
  readonly error: {
    readonly code: ApiTransportErrorCode;
    readonly message: string;
    readonly retryable: boolean;
  };
}

export function errorResponse(error: ApiTransportError): Response {
  const body: ApiErrorEnvelope = {
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    },
  };
  return new Response(JSON.stringify(body), {
    status: error.status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=UTF-8",
    },
  });
}
