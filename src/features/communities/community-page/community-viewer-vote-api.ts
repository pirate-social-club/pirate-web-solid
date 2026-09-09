import { createPirateApiClient, type PirateApiClient } from "@pirate/api-client";

import {
  createGeneratedApiClient,
  type ApiClientFactoryOptions,
} from "../../../api/client.ts";

/**
 * The community thread feed is deliberately anonymous: its handler reads
 * without a viewer even when a caller supplies credentials, and its projection
 * hardcodes a null viewer vote. So the viewer's own vote cannot come from it
 * and must not be added to it, because that response is public. The
 * authenticated post read already computes the vote for the account making the
 * request, which is where this takes it from.
 */
export type CommunityViewerVoteClient = Pick<PirateApiClient, "get_postsPostId">;

export type ViewerVote = -1 | 1 | null;

/** How many post reads may be in flight at once for one page of the feed. */
const MAX_IN_FLIGHT = 4;

export function createCommunityViewerVoteClient(
  options: ApiClientFactoryOptions = {},
): CommunityViewerVoteClient {
  return createGeneratedApiClient(createPirateApiClient, options, { credentials: "same-origin" });
}

export interface LoadViewerVoteOptions {
  readonly client: CommunityViewerVoteClient;
  readonly postId: string;
  readonly locale?: string;
}

/**
 * The viewer's vote on one post, or null when they have not voted. An
 * age-locked projection carries no engagement metadata at all, so it reports
 * no vote rather than inventing one.
 */
export async function loadViewerVote(options: LoadViewerVoteOptions): Promise<ViewerVote> {
  const response = await options.client.get_postsPostId({
    path: { postId: options.postId },
    query: { locale: options.locale ?? "en" },
  });
  if ("kind" in response) return null;
  return response.viewer_vote === 1 || response.viewer_vote === -1 ? response.viewer_vote : null;
}

export interface CommunityViewerVoteReader {
  /**
   * The resolved vote for a post, or undefined while it is still unknown. The
   * first ask for a post starts its read; later asks join that same one.
   */
  read(postId: string): ViewerVote | undefined;
}

export interface CreateCommunityViewerVoteReaderOptions {
  readonly client: CommunityViewerVoteClient;
  readonly locale?: string;
  /** Records a settled vote so the caller can re-render the post it belongs to. */
  readonly onSettled: (postId: string, vote: ViewerVote) => void;
  readonly load?: (options: LoadViewerVoteOptions) => Promise<ViewerVote>;
}

/**
 * Reads votes one post at a time, on demand, with a small number in flight.
 * A page of the feed would otherwise open twenty-five authenticated reads at
 * once for information the viewer may never scroll to.
 */
export function createCommunityViewerVoteReader(
  options: CreateCommunityViewerVoteReaderOptions,
): CommunityViewerVoteReader {
  const settled = new Map<string, ViewerVote>();
  const started = new Set<string>();
  const queue: string[] = [];
  let inFlight = 0;

  const settle = (postId: string, vote: ViewerVote) => {
    settled.set(postId, vote);
    options.onSettled(postId, vote);
  };

  const pump = () => {
    while (inFlight < MAX_IN_FLIGHT && queue.length > 0) {
      const postId = queue.shift();
      if (postId === undefined) return;
      inFlight += 1;
      const load = options.load ?? loadViewerVote;
      void load({ client: options.client, postId, ...(options.locale === undefined ? {} : { locale: options.locale }) })
        .then(
          vote => settle(postId, vote),
          // A read that fails leaves the vote genuinely unknown. Reporting no
          // vote lets the viewer act, at the cost of showing an existing vote
          // as unselected until the next load; withholding the control instead
          // would deny an action the account is entitled to take.
          () => settle(postId, null),
        )
        .finally(() => {
          inFlight -= 1;
          pump();
        });
    }
  };

  return {
    read(postId) {
      if (settled.has(postId)) return settled.get(postId);
      if (!started.has(postId)) {
        started.add(postId);
        queue.push(postId);
        pump();
      }
      return undefined;
    },
  };
}
