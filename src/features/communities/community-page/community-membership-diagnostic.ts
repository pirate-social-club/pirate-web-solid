import {
  ApiClientError,
  ApiClientProtocolError,
  ApiClientResponseValidationError,
  ApiClientUnexpectedError,
} from "@pirate/api-client";
import { SessionAuthorityChangedError } from "../../../api/browser-session-events.ts";
import { CommunityEngagementLocalError } from "./community-engagement-api.ts";

/** Closed fields only: API errors may contain private messages, paths and bodies. */
export function reportCommunityMembershipFailure(error: unknown, observation: {
  readonly elapsedMs: number;
  readonly recentSessionChange: boolean;
}): void {
  const errorClass = error instanceof ApiClientResponseValidationError ? "ApiClientResponseValidationError"
    : error instanceof ApiClientProtocolError ? "ApiClientProtocolError"
    : error instanceof ApiClientError ? "ApiClientError"
    : error instanceof ApiClientUnexpectedError ? "ApiClientUnexpectedError"
    : error instanceof CommunityEngagementLocalError ? "CommunityEngagementLocalError"
    : error instanceof SessionAuthorityChangedError ? "SessionAuthorityChangedError"
    : error instanceof TypeError ? "TypeError"
    : error instanceof DOMException ? "DOMException"
    : error instanceof Error ? "Error" : "unknown";
  const kind = error instanceof ApiClientResponseValidationError ? "response_validation"
    : error instanceof ApiClientProtocolError ? "protocol"
    : error instanceof ApiClientError || error instanceof ApiClientUnexpectedError ? "api"
    : error instanceof CommunityEngagementLocalError ? "local_validation"
    : error instanceof SessionAuthorityChangedError ? "session_changed"
    : error instanceof TypeError ? "type_or_network"
    : error instanceof DOMException && error.name === "AbortError" ? "aborted" : "unknown";
  const candidateStatus = error instanceof ApiClientResponseValidationError || error instanceof ApiClientProtocolError
    || error instanceof ApiClientError || error instanceof ApiClientUnexpectedError ? error.status : undefined;
  const status = candidateStatus !== undefined && Number.isInteger(candidateStatus)
    && candidateStatus >= 100 && candidateStatus <= 599 ? candidateStatus : undefined;
  const elapsedMs = Number.isFinite(observation.elapsedMs)
    ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(observation.elapsedMs))) : 0;
  try {
    console.error("community.membership.read.failed", {
      errorClass, kind, status, elapsedMs, recentSessionChange: observation.recentSessionChange,
    });
  } catch { /* Diagnostics must not change membership recovery. */ }
}
