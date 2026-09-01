import { For, Show } from "solid-js";

import {
  Avatar,
  Button,
  Card,
  Separator,
  Type,
} from "@pirate/web-solid-ui";
import { resolveLocaleLanguageTag } from "../../../lib/ui-locale-core";
import { useUiLocale } from "../../../lib/ui-locale";
import {
  buildPublicProfilePath,
  formatMembershipRequestDate,
  getApplicantLabel,
  isMembershipRequestProcessing,
  type MembershipRequestSummary,
} from "./membership-requests-page-model";

export type { MembershipRequestSummary } from "./membership-requests-page-model";

export interface CommunityMembershipRequestsPageProps {
  loading?: boolean;
  onApprove: (request: MembershipRequestSummary) => void;
  onReject: (request: MembershipRequestSummary) => void;
  processingRequestId?: string | null;
  requests: MembershipRequestSummary[];
  showHeading?: boolean;
}

function MembershipRequestApplicantContent(props: {
  applicantLabel: string;
  dateLabel: string;
  request: MembershipRequestSummary;
}) {
  const request = () => props.request;
  const applicantLabel = () => props.applicantLabel;
  const dateLabel = () => props.dateLabel;

  return (
    <>
      <Avatar
        fallback={applicantLabel()}
        fallbackSeed={request().applicant_user}
        size="md"
        src={request().applicant_avatar_ref ?? undefined}
      />
      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <Type as="span" class="min-w-0 truncate" variant="body-strong">
            {applicantLabel()}
          </Type>
          <Type as="span" class="text-muted-foreground" variant="caption">
            {dateLabel()}
          </Type>
        </div>
        <Show
          when={request().note?.trim()}
          fallback={
            <Type as="p" class="mt-2 text-muted-foreground" variant="body">
              No message.
            </Type>
          }
        >
          <Type as="p" class="mt-2 whitespace-pre-wrap text-muted-foreground" variant="body">
            {request().note}
          </Type>
        </Show>
      </div>
    </>
  );
}

function MembershipRequestRow(props: {
  dateLocale: string;
  onApprove: (request: MembershipRequestSummary) => void;
  onReject: (request: MembershipRequestSummary) => void;
  processingRequestId?: string | null;
  request: MembershipRequestSummary;
}) {
  const request = () => props.request;
  const applicantLabel = () => getApplicantLabel(request());
  const processing = () => isMembershipRequestProcessing(request().id, props.processingRequestId);
  const profileHref = () => {
    const applicantHandle = request().applicant_handle;
    return applicantHandle ? buildPublicProfilePath(applicantHandle) : null;
  };

  return (
    <div data-membership-request-id={request().id} data-testid={`membership-request-${request().id}`}>
      <div class="flex flex-col gap-4 p-5 md:flex-row md:items-start">
        <Show
          when={profileHref()}
          fallback={
            <div class="flex min-w-0 flex-1 items-start gap-3">
              <MembershipRequestApplicantContent
                applicantLabel={applicantLabel()}
                dateLabel={formatMembershipRequestDate(request().created, props.dateLocale)}
                request={request()}
              />
            </div>
          }
        >
          {(href) => (
            <a class="flex min-w-0 flex-1 items-start gap-3" href={href()}>
              <MembershipRequestApplicantContent
                applicantLabel={applicantLabel()}
                dateLabel={formatMembershipRequestDate(request().created, props.dateLocale)}
                request={request()}
              />
            </a>
          )}
        </Show>

        <div class="flex shrink-0 gap-2 md:justify-end">
          <Button
            disabled={processing()}
            loading={processing()}
            onClick={() => props.onApprove(request())}
          >
            Approve
          </Button>
          <Button
            disabled={processing()}
            onClick={() => props.onReject(request())}
            variant="secondary"
          >
            Reject
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CommunityMembershipRequestsPage(props: CommunityMembershipRequestsPageProps) {
  const locale = () => useUiLocale();
  const loading = () => props.loading ?? false;
  const requests = () => props.requests;
  const processingRequestId = () => props.processingRequestId;
  const dateLocale = () => resolveLocaleLanguageTag(locale());

  return (
    <section class="flex min-w-0 flex-col gap-6" data-membership-requests-page>
      <Show when={props.showHeading !== false}><div class="space-y-2">
        <Type as="h1" variant="h2">Requests</Type>
        <Type as="p" class="max-w-2xl text-muted-foreground" variant="body">
          Review who can join this community.
        </Type>
      </div></Show>

      <Card class="overflow-hidden">
        <Show
          when={!loading()}
          fallback={
            <div class="px-5 py-8 text-center">
              <Type as="p" class="text-muted-foreground" variant="body">Loading requests&hellip;</Type>
            </div>
          }
        >
          <Show
            when={requests().length > 0}
            fallback={
              <div class="px-5 py-8 text-center">
                <Type as="p" class="text-muted-foreground" variant="body">No pending requests.</Type>
              </div>
            }
          >
            <div>
              <For each={requests()}>
                {(request, index) => (
                  <div>
                    <Show when={index() > 0}>
                      <Separator />
                    </Show>
                    <MembershipRequestRow
                      dateLocale={dateLocale()}
                      onApprove={props.onApprove}
                      onReject={props.onReject}
                      processingRequestId={processingRequestId()}
                      request={request}
                    />
                  </div>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </Card>
    </section>
  );
}
