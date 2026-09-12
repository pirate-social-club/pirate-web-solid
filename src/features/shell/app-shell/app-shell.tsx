/** @jsxImportSource @solidjs/web */

import { Button, Type } from "../../../design-system";

export function RootErrorState(props: { onHome?: () => void }) {
  return <section aria-live="polite" class="mx-auto flex min-h-64 max-w-xl flex-col items-center justify-center gap-4 px-6 text-center"><Type as="h1" variant="h2">We hit a temporary problem</Type><Type variant="body">This page did not finish loading. Try returning home and opening it again.</Type><Button onClick={props.onHome} type="button" variant="outline">Return home</Button></section>;
}
