import { Button, cn } from "../../../design-system";
import type { IanaTz, IsoInstant } from "../view-models";
import { buildIcs, triggerDownload } from "./calendar-file";

export interface AddToCalendarProps {
  bookingTitle: string;
  hostName: string;
  startUtc: IsoInstant;
  endUtc: IsoInstant;
  viewerTimezone: IanaTz;
  class?: string;
}

export function AddToCalendar(props: AddToCalendarProps) {
  const onClick = () => {
    const ics = buildIcs(props);
    const datePart = props.startUtc.slice(0, 10).replace(/-/g, "");
    triggerDownload(ics, `pirate-booking-${datePart}.ics`);
  };

  return (
    <Button class={cn(props.class)} onClick={onClick} variant="secondary">
      Add to calendar
    </Button>
  );
}
