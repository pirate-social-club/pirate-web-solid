import { renderToString } from "@solidjs/web";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/actions/button/button";
import { AutoResizeTextarea } from "@/components/forms/auto-resize-textarea/auto-resize-textarea";
import { Checkbox } from "@/components/forms/checkbox/checkbox";
import { Combobox } from "@/components/forms/combobox/combobox";
import { EditableNumberInput } from "@/components/forms/editable-number-input/editable-number-input";
import { Input } from "@/components/forms/input/input";
import { PrefixInput } from "@/components/forms/prefix-input/prefix-input";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/forms/radio-group/radio-group";
import { Select } from "@/components/forms/select/select";
import { Switch } from "@/components/forms/switch/switch";
import { Textarea } from "@/components/forms/textarea/textarea";
import {
  TextField,
  TextFieldDescription,
  TextFieldInput,
  TextFieldLabel,
} from "@/components/forms/text-field/text-field";
import { CheckboxCard } from "@/patterns/forms/checkbox-card/checkbox-card";
import { CopyField } from "@/patterns/forms/copy-field/copy-field";
import { FormFieldLabel } from "@/patterns/forms/form-layout/form-layout";
import { OptionCard } from "@/patterns/forms/option-card/option-card";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/overlays/alert-dialog/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/overlays/dialog/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuGroupLabel,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/overlays/dropdown-menu/dropdown-menu";
import { Toaster } from "@/components/overlays/toast/toast";
import { ActionMenu } from "@/patterns/overlays/action-menu/action-menu";
import { ConfirmDialog } from "@/patterns/overlays/confirm-dialog/confirm-dialog";
import { FlatTabBar, FlatTabButton } from "@/patterns/navigation/flat-tabs/flat-tabs";
import { StackedSectionNav } from "@/patterns/navigation/stacked-section-nav/stacked-section-nav";
import { ResponsiveOptionSelect } from "@/patterns/forms/responsive-option-select/responsive-option-select";
import { AvatarBadge } from "@/patterns/identity/avatar-badge/avatar-badge";
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle,
} from "@/patterns/overlays/modal/modal";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/patterns/navigation/sidebar";
import { AppHeader } from "@/patterns/navigation/app-header/app-header";
import { MobileFooterNav } from "@/patterns/navigation/mobile-footer-nav/mobile-footer-nav";
import { MobilePageHeader } from "@/patterns/navigation/mobile-page-header/mobile-page-header";
import {
  AuthRequiredRouteState,
  NotFoundRouteState,
  RouteLoadingState,
} from "@/patterns/feedback/route-states/route-states";
import { StatusCard } from "@/patterns/feedback/status-card/status-card";
import { StackPageShell } from "@/patterns/layout/stack-page-shell/stack-page-shell";
import { VerticalFeed } from "@/patterns/engagement/vertical-feed/vertical-feed";

function renderHtml(ui: () => unknown): string {
  return renderToString(() => <>{ui()}</>);
}

describe("SSR smoke", () => {
  it("renders Button without browser APIs", () => {
    expect(renderHtml(() => <Button>Continue</Button>)).toContain("Continue");
  });

  it("renders Input without browser APIs", () => {
    expect(
      renderHtml(() => <Input aria-label="Name" placeholder="Type something…" />),
    ).toContain('placeholder="Type something…"');
  });

  it("renders TextField without browser APIs", () => {
    expect(
      renderHtml(() => (
        <TextField name="display-name">
          <TextFieldLabel>Display name</TextFieldLabel>
          <TextFieldInput />
          <TextFieldDescription>Shown on your profile.</TextFieldDescription>
        </TextField>
      )),
    ).toContain("Display name");
  });

  it("renders Dialog without browser APIs", () => {
    expect(
      renderHtml(() => (
        <Dialog>
          <DialogTrigger>Open dialog</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit profile</DialogTitle>
              <DialogDescription>Make changes here.</DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      )),
    ).toContain("Open dialog");
  });

  it("renders AlertDialog without browser APIs", () => {
    expect(
      renderHtml(() => (
        <AlertDialog>
          <AlertDialogTrigger>Open alert</AlertDialogTrigger>
          <AlertDialogContent hideCloseButton>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove this song?</AlertDialogTitle>
              <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter />
          </AlertDialogContent>
        </AlertDialog>
      )),
    ).toContain("Open alert");
  });

  it("renders DropdownMenu without browser APIs", () => {
    expect(
      renderHtml(() => (
        <DropdownMenu>
          <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>View details</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuGroupLabel>Playback</DropdownMenuGroupLabel>
              <DropdownMenuCheckboxItem defaultChecked>Autoplay</DropdownMenuCheckboxItem>
            </DropdownMenuGroup>
            <DropdownMenuGroup>
              <DropdownMenuGroupLabel>Quality</DropdownMenuGroupLabel>
              <DropdownMenuRadioGroup defaultValue="high">
                <DropdownMenuRadioItem value="high">High</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )),
    ).toContain("Open menu");
  });

  it("renders Toaster without browser APIs", () => {
    expect(renderHtml(() => <Toaster />).length).toBeGreaterThan(0);
  });

  it("renders ActionMenu without browser APIs", () => {
    expect(
      renderHtml(() => (
        <ActionMenu items={[{ key: "edit", label: "Edit" }]} label="Open menu" />
      )),
    ).toContain("Open menu");
  });

  it("renders ConfirmDialog without browser APIs", () => {
    expect(
      renderHtml(() => (
        <ConfirmDialog
          title="Delete this song?"
          description="This will remove the song from your list."
          confirmLabel="Delete"
          cancelLabel="Keep"
          triggerLabel="Delete song"
          onConfirm={() => {}}
        />
      )),
    ).toContain("Delete song");
  });

  it("renders VerticalFeed without browser APIs", () => {
    expect(
      renderHtml(() => (
        <VerticalFeed
          posts={[
            {
              id: "post-1",
              videoUrl: "/clip.mp4",
              posterUrl: "/poster.jpg",
              authorName: "wavemaker",
              caption: "First post.",
              likeCount: 12,
            },
          ]}
        />
      )),
    ).toContain("@wavemaker");
  });

  it("renders FlatTabs without browser APIs", () => {
    expect(
      renderHtml(() => (
        <FlatTabBar columns={2}>
          <FlatTabButton active>Feed</FlatTabButton>
          <FlatTabButton>About</FlatTabButton>
        </FlatTabBar>
      )),
    ).toContain("Feed");
  });

  it("renders StackedSectionNav without browser APIs", () => {
    expect(
      renderHtml(() => (
        <StackedSectionNav
          sections={[
            {
              label: "Account",
              items: [{ label: "Profile", active: true }, { label: "Privacy" }],
            },
          ]}
        />
      )),
    ).toContain("Profile");
  });

  it("renders ResponsiveOptionSelect without browser APIs", () => {
    expect(
      renderHtml(() => (
        <ResponsiveOptionSelect
          ariaLabel="Sort"
          drawerTitle="Sort"
          options={[{ label: "Best", value: "best" }]}
          value="best"
        />
      )),
    ).toContain("Best");
  });

  it("renders AvatarBadge without browser APIs", () => {
    expect(
      renderHtml(() => (
        <AvatarBadge
          badgeCountryCode="us"
          badgeLabel="Verified United States nationality"
          fallback="Ada Lovelace"
          flagUrlForCountryCode={(code) => `/flags/${code}.svg`}
        />
      )),
    ).toContain("/flags/us.svg");
  });

  it("renders Modal without browser APIs", () => {
    // Dialog/Sheet content is portaled, so SSR output is intentionally empty;
    // the check proves the pattern evaluates with no module-scope browser API.
    expect(
      renderHtml(() => (
        <Modal forceMobile={false} open>
          <ModalContent>
            <ModalHeader>
              <ModalTitle>Unlock this content</ModalTitle>
              <ModalDescription>Add funds to continue.</ModalDescription>
            </ModalHeader>
          </ModalContent>
        </Modal>
      )),
    ).toBe("");
  });

  it("renders Sidebar without browser APIs", () => {
    expect(
      renderHtml(() => (
        <SidebarProvider>
          <Sidebar>
            <SidebarHeader>
              <span>Brand</span>
            </SidebarHeader>
            <SidebarContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive tooltip="Home">
                    <span>Home</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarContent>
          </Sidebar>
        </SidebarProvider>
      )),
    ).toContain("Home");
  });

  it("renders AppHeader without browser APIs", () => {
    expect(
      renderHtml(() => <AppHeader forceMobile={false} />),
    ).toContain("PIRATE");
  });

  it("renders MobileFooterNav without browser APIs", () => {
    expect(
      renderHtml(() => <MobileFooterNav activeItem="inbox" />),
    ).toContain("Inbox");
  });

  it("renders MobilePageHeader without browser APIs", () => {
    expect(
      renderHtml(() => <MobilePageHeader title="Notifications" />),
    ).toContain("Notifications");
  });

  it("renders route states without browser APIs", () => {
    expect(renderHtml(() => <RouteLoadingState />)).toContain("svg");
    expect(
      renderHtml(() => <NotFoundRouteState path="/missing" />),
    ).toContain("/missing");
    expect(
      renderHtml(() => (
        <AuthRequiredRouteState
          description="Sign in to view your inbox."
          title="Inbox"
        />
      )),
    ).toContain("Inbox");
  });

  it("renders StatusCard and StackPageShell without browser APIs", () => {
    expect(
      renderHtml(() => <StatusCard title="All set" description="Done." tone="success" />),
    ).toContain("All set");
    expect(
      renderHtml(() => (
        <StackPageShell title="Settings">
          <div>Body</div>
        </StackPageShell>
      )),
    ).toContain("Settings");
  });

  it("renders Batch 3 form controls without browser APIs", () => {
    const sortOptions = [
      { value: "new", label: "Newest" },
      { value: "top", label: "Top rated" },
    ];

    expect(
      renderHtml(() => (
        <>
          <Textarea aria-label="Notes" />
          <AutoResizeTextarea aria-label="Reply" />
          <PrefixInput prefix="$" aria-label="Amount" />
          <EditableNumberInput aria-label="Duration" value={30} onValueChange={() => {}} />
          <Checkbox aria-label="Accept terms" />
          <Switch aria-label="Dark mode" />
          <RadioGroup aria-label="Sort order">
            <RadioGroupItem value="new">Newest</RadioGroupItem>
          </RadioGroup>
          <Select
            aria-label="Sort order"
            options={sortOptions}
            optionValue={(option) => option.value}
            optionLabel={(option) => option.label}
            placeholder="Pick one"
          />
          <Combobox
            aria-label="Pick a song"
            options={sortOptions}
            optionValue={(option) => option.value}
            optionLabel={(option) => option.label}
            placeholder="Search songs"
          />
          <CheckboxCard title="Accept terms" />
          <OptionCard title="Monthly" />
          <FormFieldLabel htmlFor="name" label="Display name" />
          <CopyField value="0x1234" copyLabel="address" />
        </>
      )),
    ).toContain("Sort order");
  });
});
