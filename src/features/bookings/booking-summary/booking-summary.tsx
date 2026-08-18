import { Card, CardContent, Separator, Type } from "../../../design-system";
import type { BookingQuotePreview, IanaTz } from "../view-models";
import {
  getBookingSummaryAmounts,
  getBookingSummarySession,
} from "./booking-summary-model";

export interface BookingSummaryProps {
  quote: BookingQuotePreview;
  viewerTimezone: IanaTz;
  class?: string;
}

export function BookingSummary(props: BookingSummaryProps) {
  const session = () => getBookingSummarySession(props.quote, props.viewerTimezone);
  const amounts = () => getBookingSummaryAmounts(props.quote);
  return (
    <Card class={props.class}>
      <CardContent class="flex flex-col gap-4 p-6">
        <div class="flex flex-col gap-1">
          <Type variant="label">Session</Type>
          <Type variant="body-strong">
            {session().date}{" at "}{session().time}
          </Type>
          <Type variant="caption">
            {session().duration}{" · "}{session().timezone}
          </Type>
        </div>

        <Separator />

        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <Type variant="body">Session price</Type>
            <Type variant="body-strong">{amounts().gross}</Type>
          </div>
          <div class="flex items-center justify-between">
            <Type variant="body">Platform fee (10%)</Type>
            <Type variant="body">{amounts().platformFee}</Type>
          </div>
          <div class="flex items-center justify-between">
            <Type variant="caption">Host receives</Type>
            <Type variant="caption">{amounts().hostPayout}</Type>
          </div>
        </div>

        <Separator />

        <div class="flex items-center justify-between">
          <Type variant="label">Total</Type>
          <Type as="span" variant="h3">{amounts().gross}</Type>
        </div>

        <Type variant="caption">Payment held until your session is complete.</Type>
      </CardContent>
    </Card>
  );
}
