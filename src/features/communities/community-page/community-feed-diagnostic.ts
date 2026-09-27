import {
  ApiClientError,
  ApiClientProtocolError,
  ApiClientResponseValidationError,
  ApiClientUnexpectedError,
} from "@pirate/api-client";

/** Do not log error messages/bodies: API errors can contain upstream content. */
export function reportCommunityFeedFailure(error: unknown, phase: "preflight" | "page"): void {
  const kind = error instanceof ApiClientResponseValidationError ? "response_validation"
    : error instanceof ApiClientProtocolError ? "protocol"
    : error instanceof ApiClientError || error instanceof ApiClientUnexpectedError ? "api"
    : error instanceof TypeError ? "type_or_network"
    : "unknown";
  const status = error instanceof ApiClientResponseValidationError || error instanceof ApiClientProtocolError
    || error instanceof ApiClientError || error instanceof ApiClientUnexpectedError ? error.status : undefined;
  console.error("community.feed.failed", { phase, kind, status });
}
