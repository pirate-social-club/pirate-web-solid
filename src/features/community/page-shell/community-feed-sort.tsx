import { createEffect, createSignal, For } from "solid-js";
import {
  Button,
  createMediaQuery,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  IconCheck,
  IconFadersHorizontal,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@pirate/web-solid-ui";

const sorts = ["Best", "New", "Top"] as const;
const triggerClass = "grid size-10 place-items-center rounded-full bg-background/75 text-foreground shadow-sm backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Menu on desktop, sheet on phones; both report the same controlled sort. */
export function CommunityFeedSort(props: { value: string; onChange: (value: string) => void }) {
  const [sheetOpen, setSheetOpen] = createSignal(false, { ownedWrite: true });
  const [menuOpen, setMenuOpen] = createSignal(false, { ownedWrite: true });
  const desktop = createMediaQuery("(min-width: 768px)");
  createEffect(desktop, (wide, previous) => {
    if (previous !== undefined && wide !== previous) { setMenuOpen(false); setSheetOpen(false); }
  });
  return (
    <div class="shrink-0">
      <div class="hidden md:block">
        <DropdownMenu open={menuOpen()} onOpenChange={setMenuOpen} placement="bottom-end" gutter={4}>
          <DropdownMenuTrigger aria-label="Sort community feed" class={triggerClass}>
            <IconFadersHorizontal class="size-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent class="w-40" aria-label="Sort community feed">
            <DropdownMenuRadioGroup value={props.value} onChange={value => { props.onChange(value); setMenuOpen(false); }}>
              <For each={sorts}>{sort => <DropdownMenuRadioItem value={sort}>{sort}</DropdownMenuRadioItem>}</For>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div class="md:hidden">
        <Sheet open={sheetOpen()} onOpenChange={setSheetOpen}>
          <SheetTrigger aria-label="Sort community feed" class={triggerClass}>
            <IconFadersHorizontal class="size-5" />
          </SheetTrigger>
          <SheetContent side="bottom" class="max-h-[75dvh] rounded-t-[var(--radius-3xl)] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4">
            <div aria-hidden="true" class="mx-auto mb-4 h-1 w-12 rounded-full bg-muted" />
            <SheetHeader class="pe-12 text-start"><SheetTitle>Sort feed</SheetTitle></SheetHeader>
            <div role="group" aria-label="Sort feed" class="mt-5 grid gap-3">
              <For each={sorts}>{sort => (
                <Button
                  aria-pressed={props.value === sort ? "true" : "false"}
                  class="min-h-14 w-full justify-between px-4 py-3"
                  variant={props.value === sort ? "default" : "secondary"}
                  trailingIcon={props.value === sort ? <IconCheck class="size-5" /> : undefined}
                  onClick={() => { props.onChange(sort); setSheetOpen(false); }}
                >{sort}</Button>
              )}</For>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
