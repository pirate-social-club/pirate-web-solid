interface IconProps {
  class?: string;
  filled?: boolean;
}

export function IconX(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      class={props.class}
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" />
    </svg>
  );
}

export function IconFileText(props: IconProps) {
  return (
    <svg aria-hidden="true" class={props.class} fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke-linejoin="round" />
      <path d="M14 3v4h4M9 12h6M9 16h6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function IconImage(props: IconProps) {
  return (
    <svg aria-hidden="true" class={props.class} fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect height="16" rx="2" width="18" x="3" y="4" />
      <circle cx="9" cy="9.5" r="1.8" />
      <path d="m5 19 5-5 3 3 3.5-3.5L21 18" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function IconMaskHappy(props: IconProps) {
  return (
    <svg aria-hidden="true" class={props.class} fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 5.5C4 4.7 4.7 4 5.5 4h13c.8 0 1.5.7 1.5 1.5v6c0 4.4-3.6 8.5-8 8.5s-8-4.1-8-8.5v-6Z" stroke-linejoin="round" />
      <path d="M8.5 10.2c.5-.6 1.4-.6 1.9 0M13.6 10.2c.5-.6 1.4-.6 1.9 0" stroke-linecap="round" />
      <path d="M8.6 13.4c.8 1.4 2 2.1 3.4 2.1s2.6-.7 3.4-2.1" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function IconMicrophone(props: IconProps) {
  return (
    <svg aria-hidden="true" class={props.class} fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect height="11" rx="3" width="6" x="9" y="3" />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v4" stroke-linecap="round" />
    </svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <svg aria-hidden="true" class={props.class} fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6.5 7l1 13h9l1-13" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M10 11v6M14 11v6" stroke-linecap="round" />
    </svg>
  );
}

export function IconPencil(props: IconProps) {
  return (
    <svg aria-hidden="true" class={props.class} fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="m14 5 5 5M4 20l3.5-.7L19 7.8a2.1 2.1 0 0 0-3-3L4.7 16.5 4 20Z" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function IconUploadSimple(props: IconProps) {
  return (
    <svg aria-hidden="true" class={props.class} fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 16V4m0 0 4.5 4.5M12 4 7.5 8.5" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function IconUsersThree(props: IconProps) {
  return (
    <svg aria-hidden="true" class={props.class} fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="8.5" r="3" />
      <path d="M6.5 19a5.5 5.5 0 0 1 11 0" stroke-linecap="round" />
      <path d="M4.8 9.8a2.2 2.2 0 1 1 2.4 3.6M2.5 16.5a4 4 0 0 1 3.5-2.2M19.2 9.8a2.2 2.2 0 1 0-2.4 3.6M21.5 16.5a4 4 0 0 0-3.5-2.2" stroke-linecap="round" />
    </svg>
  );
}

// Post-card feature icons (B7a). Same simplified stroke style as above.

export function IconArrowSquareOut(props: IconProps) {
  return (
    <svg aria-hidden="true" class={props.class} fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 4h6v6M20 4 10 14M9 5H5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-4" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function IconArrowsClockwise(props: IconProps) {
  return (
    <svg aria-hidden="true" class={props.class} fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 12a8 8 0 0 1 13.6-5.7M20 12a8 8 0 0 1-13.6 5.7" stroke-linecap="round" />
      <path d="M18 3v4h-4M6 21v-4h4" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function IconBroadcast(props: IconProps) {
  return (
    <svg aria-hidden="true" class={props.class} fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <path d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5 5a10.2 10.2 0 0 0 0 14M19 5a10.2 10.2 0 0 1 0 14" stroke-linecap="round" />
    </svg>
  );
}

export function IconCalendarBlank(props: IconProps) {
  return (
    <svg aria-hidden="true" class={props.class} fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M8 3v4M16 3v4" stroke-linecap="round" />
    </svg>
  );
}

export function IconCalendar(props: IconProps) {
  return (
    <svg aria-hidden="true" class={props.class} fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M8 3v4M16 3v4M9 15l2 2 4-4" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function IconCheckCircle(props: IconProps) {
  return (
    <svg aria-hidden="true" class={props.class} fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.2 2.4 2.4 4.6-4.8" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function IconClock(props: IconProps) {
  return (
    <svg aria-hidden="true" class={props.class} fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.2l3.2 1.8" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function IconCrown(props: IconProps) {
  return (
    <svg aria-hidden="true" class={props.class} fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 17 3 8l4.8 3L12 5.5 16.2 11 21 8l-1 9zM4.5 20.5h15" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function IconDotsThree(props: IconProps) {
  return (
    <svg aria-hidden="true" class={props.class} fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="5.5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconDownloadSimple(props: IconProps) {
  return (
    <svg aria-hidden="true" class={props.class} fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 4v11M6.5 10l5.5 5.5L17.5 10M5 20h14" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function IconGlobe(props: IconProps) {
  return (
    <svg aria-hidden="true" class={props.class} fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c-2.7 2.4-4 5.4-4 9s1.3 6.6 4 9c2.7-2.4 4-5.4 4-9s-1.3-6.6-4-9z" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function IconInfo(props: IconProps) {
  return (
    <svg aria-hidden="true" class={props.class} fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" stroke-linecap="round" />
      <circle cx="12" cy="7.6" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconLink(props: IconProps) {
  return (
    <svg aria-hidden="true" class={props.class} fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 14a4 4 0 0 0 6 .4l3-3a4 4 0 0 0-5.7-5.7L12 7M14 10a4 4 0 0 0-6-.4l-3 3a4 4 0 0 0 5.7 5.7L12 17" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function IconLock(props: IconProps) {
  return (
    <svg aria-hidden="true" class={props.class} fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect x="5.5" y="10.5" width="13" height="9.5" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" stroke-linecap="round" />
    </svg>
  );
}

export function IconMapPin(props: IconProps) {
  return (
    <svg aria-hidden="true" class={props.class} fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 21s-6.8-6-6.8-10.8a6.8 6.8 0 0 1 13.6 0C18.8 15 12 21 12 21z" stroke-linejoin="round" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  );
}

export function IconRobot(props: IconProps) {
  return (
    <svg aria-hidden="true" class={props.class} fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="9" width="14" height="10" rx="2" />
      <path d="M12 5v4M3 13v3M21 13v3" stroke-linecap="round" />
      <circle cx="9.5" cy="13.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="13.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="4" r="1" />
    </svg>
  );
}

export function IconShareFat(props: IconProps) {
  return (
    <svg aria-hidden="true" class={props.class} fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M13.5 5.5 20 11l-6.5 5.5v-3.3C8 13.2 5.3 15.6 4 19c-.3-5.5 3-10.5 9.5-11.2z" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function IconShareNetwork(props: IconProps) {
  return (
    <svg aria-hidden="true" class={props.class} fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="6" cy="12" r="2.6" />
      <circle cx="17.5" cy="5.5" r="2.6" />
      <circle cx="17.5" cy="18.5" r="2.6" />
      <path d="m8.4 10.8 6.8-4M8.4 13.2l6.8 4" stroke-linecap="round" />
    </svg>
  );
}

export function IconShield(props: IconProps) {
  return (
    <svg aria-hidden="true" class={props.class} fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 3 19 6v6c0 4.3-2.9 7.3-7 9-4.1-1.7-7-4.7-7-9V6z" stroke-linejoin="round" />
    </svg>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <svg aria-hidden="true" class={props.class} fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19c.5-3 2.7-4.6 5.5-4.6s5 1.6 5.5 4.6" stroke-linecap="round" />
      <circle cx="16.8" cy="9.5" r="2.4" />
      <path d="M16.2 14.6c2.3.3 3.8 1.7 4.3 4" stroke-linecap="round" />
    </svg>
  );
}

export function IconVideoCamera(props: IconProps) {
  return (
    <svg aria-hidden="true" class={props.class} fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="7" width="12" height="10" rx="2" />
      <path d="m15 11 6-3v8l-6-3z" stroke-linejoin="round" />
    </svg>
  );
}

export function IconVinylRecord(props: IconProps) {
  return (
    <svg aria-hidden="true" class={props.class} fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M12 6a6 6 0 0 1 6 6" stroke-linecap="round" />
    </svg>
  );
}

export function IconWarningCircle(props: IconProps) {
  return (
    <svg aria-hidden="true" class={props.class} fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V13" stroke-linecap="round" />
      <circle cx="12" cy="16.4" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      class={props.class}
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function IconArrowUp(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      class={props.class}
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 19V5M5 12l7-7 7 7" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function IconArrowDown(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      class={props.class}
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 5v14M19 12l-7 7-7-7" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function IconChatCircle(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      class={props.class}
      fill={props.filled ? "currentColor" : "none"}
      stroke="currentColor"
      stroke-width="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" stroke={props.filled ? "none" : "currentColor"} stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function IconPlay(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      class={props.class}
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14Z" />
    </svg>
  );
}

export function IconPause(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      class={props.class}
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect height="14" rx="1.5" width="4" x="6" y="5" />
      <rect height="14" rx="1.5" width="4" x="14" y="5" />
    </svg>
  );
}

export function IconMusicNote(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      class={props.class}
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M9 18V5l12-2v13" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

export function IconCopy(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      class={props.class}
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="13" height="13" x="9" y="9" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function IconCaretDown(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      class={props.class}
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" />
    </svg>
  );
}

export function IconCaretLeft(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      class={props.class}
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" />
    </svg>
  );
}

export function IconCaretRight(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      class={props.class}
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" />
    </svg>
  );
}

export function IconArrowLeft(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      class={props.class}
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M19 12H5M12 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      class={props.class}
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M5 12h14M12 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function IconHouse(props: IconProps) {
  return (
    <svg aria-hidden="true" class={props.class} fill={props.filled ? "currentColor" : "none"} stroke={props.filled ? "none" : "currentColor"} stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="m3 10.5 9-7.5 9 7.5V21H3zM9 21v-6h6v6z" fill-rule={props.filled ? "evenodd" : undefined} />
    </svg>
  );
}

export function IconBell(props: IconProps) {
  return (
    <svg aria-hidden="true" class={props.class} fill={props.filled ? "currentColor" : "none"} stroke={props.filled ? "none" : "currentColor"} stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 20a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

export function IconWallet(props: IconProps) {
  return (
    <svg aria-hidden="true" class={props.class} fill={props.filled ? "currentColor" : "none"} stroke={props.filled ? "none" : "currentColor"} stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 4h12a2 2 0 0 1 2 2v1H6a3 3 0 0 0-3 3V6a2 2 0 0 1 2-2ZM3 10a3 3 0 0 1 3-3h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10Zm13 3a1 1 0 1 0 0 2h2a1 1 0 1 0 0-2h-2Z" fill-rule={props.filled ? "evenodd" : undefined} />
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      class={props.class}
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 5v14M5 12h14" stroke-linecap="round" />
    </svg>
  );
}

export function IconList(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      class={props.class}
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M4 6h16M4 12h16M4 18h16" stroke-linecap="round" />
    </svg>
  );
}

export function IconSquare(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      class={props.class}
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect height="16" rx="2" width="16" x="4" y="4" />
    </svg>
  );
}

export function IconSidebarSimple(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      class={props.class}
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect height="16" rx="2" width="18" x="3" y="4" />
      <path d="M9.5 4v16" />
    </svg>
  );
}

export function IconFire(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      class={props.class}
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 22c4.4 0 7-2.8 7-6.5 0-2.6-1.4-4.6-2.7-6.3C15 7.6 13.5 5.6 13 3c-2.5 1.6-4 4-4.2 6.3-.1 1-.4 1.7-1 2.2-.5.5-1 .6-1.5.4-.4-.1-.8-.4-1.1-.9C4.7 12.4 5 14 5 15.5 5 19.2 7.6 22 12 22Z" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function IconFlag(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      class={props.class}
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M5 21V4" stroke-linecap="round" />
      <path d="M5 4h12.5a.5.5 0 0 1 .4.8L15 9l2.9 4.2a.5.5 0 0 1-.4.8H5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function IconMagnifyingGlass(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      class={props.class}
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.8-3.8" stroke-linecap="round" />
    </svg>
  );
}

export function IconTrendUp(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      class={props.class}
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M3 17l6-6 4 4 8-8" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M15 7h6v6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}
