// Public catalog entry for @pirate/web-solid-ui.
//
// The frozen bootstrap surface (Button, Dialog family, TextField family,
// useDialogContext) is re-exported from the real catalog counterparts below.
// Breaking differences from the stub, recorded for consumers:
// - Stub ButtonProps/DialogTriggerProps accepted an `as` polymorphic prop;
//   the real Button and DialogTrigger deliberately dropped polymorphism.
//   Call sites passing `as` must render the real trigger directly.

export { cn } from "./lib/cn";
export {
  MOBILE_BREAKPOINT,
  MOBILE_BREAKPOINT_QUERY,
  createIsMobile,
  createMediaQuery,
} from "./lib/media-query";

export {
  Button,
  buttonVariants,
  type ButtonProps,
} from "./components/actions/button/button";
export {
  Chip,
  type ChipProps,
} from "./components/actions/chip/chip";
export {
  IconButton,
  type IconButtonProps,
} from "./components/actions/icon-button/icon-button";
export {
  PillButton,
  pillButtonVariants,
  type PillButtonProps,
} from "./components/actions/pill-button/pill-button";

export {
  Avatar,
  type AvatarProps,
  type AvatarSize,
} from "./components/data-display/avatar/avatar";
export {
  BadgedCircle,
  type BadgedCircleProps,
} from "./components/data-display/badged-circle/badged-circle";
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./components/data-display/card/card";
export {
  FormattedText,
  type FormattedTextProps,
} from "./components/data-display/formatted-text/formatted-text";
export {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
  itemVariants,
  type ItemActionsProps,
  type ItemContentProps,
  type ItemDescriptionProps,
  type ItemGroupProps,
  type ItemMediaProps,
  type ItemProps,
  type ItemTitleProps,
} from "./components/data-display/item/item";
export {
  Separator,
  type SeparatorProps,
} from "./components/data-display/separator/separator";
export {
  Type,
  typeVariants,
  type TypeProps,
} from "./components/data-display/type/type";

export {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
  type AccordionContentProps,
  type AccordionHeaderProps,
  type AccordionItemProps,
  type AccordionTriggerProps,
} from "./components/disclosure/accordion/accordion";
export {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type TabsContentProps,
  type TabsListProps,
  type TabsTriggerProps,
  type TabsVisualVariant,
} from "./components/disclosure/tabs/tabs";

export {
  Skeleton,
} from "./components/feedback/skeleton/skeleton";
export {
  Spinner,
  type SpinnerProps,
} from "./components/feedback/spinner/spinner";

export {
  AutoResizeTextarea,
  type AutoResizeTextareaProps,
} from "./components/forms/auto-resize-textarea/auto-resize-textarea";
export {
  Checkbox,
  CheckboxDescription,
  CheckboxErrorMessage,
  CheckboxLabel,
  type CheckboxProps,
} from "./components/forms/checkbox/checkbox";
export {
  Combobox,
  type ComboboxProps,
} from "./components/forms/combobox/combobox";
export {
  EditableNumberInput,
  type EditableNumberInputProps,
} from "./components/forms/editable-number-input/editable-number-input";
export {
  Input,
  inputVariants,
  type InputProps,
} from "./components/forms/input/input";
export {
  Label,
  type LabelProps,
} from "./components/forms/label/label";
export {
  PrefixInput,
  prefixInputVariants,
  type PrefixInputProps,
} from "./components/forms/prefix-input/prefix-input";
export {
  RadioGroup,
  RadioGroupDescription,
  RadioGroupErrorMessage,
  RadioGroupItem,
  RadioGroupLabel,
  type RadioGroupItemProps,
  type RadioGroupProps,
} from "./components/forms/radio-group/radio-group";
export {
  RadioIndicator,
  type RadioIndicatorProps,
} from "./components/forms/radio-indicator/radio-indicator";
export {
  Select,
  type SelectProps,
} from "./components/forms/select/select";
export {
  Switch,
  SwitchDescription,
  SwitchErrorMessage,
  SwitchLabel,
  type SwitchProps,
} from "./components/forms/switch/switch";
export {
  Textarea,
  textareaVariants,
  type TextareaProps,
} from "./components/forms/textarea/textarea";
export {
  TextField,
  TextFieldDescription,
  TextFieldErrorMessage,
  TextFieldInput,
  TextFieldLabel,
  type TextFieldInputProps,
} from "./components/forms/text-field/text-field";

export {
  MediaControlButton,
  mediaControlButtonVariants,
  type MediaControlButtonProps,
} from "./components/media/media-control-button/media-control-button";
export {
  IconArrowDown,
  IconArrowLeft,
  IconArrowRight,
  IconArrowSquareOut,
  IconArrowUp,
  IconArrowsClockwise,
  IconBell,
  IconBroadcast,
  IconCalendar,
  IconCalendarBlank,
  IconCaretDown,
  IconCaretLeft,
  IconCaretRight,
  IconChatCircle,
  IconCheck,
  IconCheckCircle,
  IconClock,
  IconCopy,
  IconCrown,
  IconDotsThree,
  IconDownloadSimple,
  IconFire,
  IconFileText,
  IconFlag,
  IconGlobe,
  IconHouse,
  IconImage,
  IconInfo,
  IconLink,
  IconList,
  IconLock,
  IconMagnifyingGlass,
  IconMapPin,
  IconMaskHappy,
  IconMicrophone,
  IconMusicNote,
  IconPause,
  IconPencil,
  IconPlay,
  IconPlus,
  IconRobot,
  IconShareFat,
  IconShareNetwork,
  IconShield,
  IconSidebarSimple,
  IconSquare,
  IconTrash,
  IconTrendUp,
  IconUploadSimple,
  IconUsers,
  IconUsersThree,
  IconVideoCamera,
  IconVinylRecord,
  IconWallet,
  IconWarningCircle,
  IconX,
} from "./components/media/icons";
export {
  Scrubber,
  type ScrubberProps,
} from "./components/media/scrubber/scrubber";
export {
  Waveform,
  type WaveformProps,
} from "./components/media/waveform/waveform";

export {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  type AlertDialogContentProps,
} from "./components/overlays/alert-dialog/alert-dialog";
export {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  useDialogContext,
  type DialogContentProps,
} from "./components/overlays/dialog/dialog";
export {
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
} from "./components/overlays/dropdown-menu/dropdown-menu";
export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  type SheetContentProps,
} from "./components/overlays/sheet/sheet";
export {
  Toaster,
  toast,
  type ShowToastOptions,
  type ToastType,
} from "./components/overlays/toast/toast";
export {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./components/overlays/tooltip/tooltip";

export {
  CommentPill,
  type CommentPillProps,
} from "./patterns/engagement/comment-pill/comment-pill";
export {
  CommunityAvatar,
  buildDefaultCommunityAvatarSrc,
  resolveCommunityAvatarSrc,
  type CommunityAvatarProps,
} from "./patterns/engagement/community-avatar/community-avatar";
export {
  MediaActions,
  MediaPost,
  VerticalFeed,
  type HapticKind,
  type MediaActionsProps,
  type MediaPostData,
  type MediaPostProps,
  type VerticalFeedProps,
  type VideoPlayerProps,
} from "./patterns/engagement/vertical-feed";
export {
  VotePill,
  type VotePillProps,
} from "./patterns/engagement/vote-pill/vote-pill";

export {
  ActionBanner,
  type ActionBannerProps,
} from "./patterns/feedback/action-banner/action-banner";
export {
  IllustratedState,
  type IllustratedStateImage,
  type IllustratedStateProps,
} from "./patterns/feedback/illustrated-state/illustrated-state";
export {
  AuthRequiredRouteState,
  EmptyFeedState,
  EmptyInboxState,
  ErrorState,
  FullPageSpinner,
  NotFoundRouteState,
  RouteMessageState,
  RootAppErrorState,
  RouteLoadFailureState,
  RouteLoadingState,
  type AuthRequiredRouteStateProps,
  type EmptyInboxStateProps,
  type ErrorStateProps,
  type NotFoundRouteStateProps,
  type RootAppErrorStateProps,
  type RouteLoadFailureStateProps,
  type RouteLoadingStateProps,
  type RouteMessageStateProps,
} from "./patterns/feedback/route-states/route-states";
export {
  StatusCard,
  type StatusCardProps,
} from "./patterns/feedback/status-card/status-card";

export {
  CheckboxCard,
  type CheckboxCardProps,
} from "./patterns/forms/checkbox-card/checkbox-card";
export {
  CopyField,
  type CopyFieldProps,
} from "./patterns/forms/copy-field/copy-field";
export {
  FormattedTextarea,
  type FormattedTextareaToolbarAction,
  type FormattedTextareaToolbarLabels,
  type FormattedTextareaProps,
} from "./patterns/forms/formatted-textarea/formatted-textarea";
export {
  FormFieldLabel,
  FormNote,
  FormSectionHeading,
  type FormFieldLabelProps,
  type FormNoteProps,
  type FormSectionHeadingProps,
} from "./patterns/forms/form-layout/form-layout";
export {
  OptionCard,
  optionCardVariants,
  type OptionCardProps,
} from "./patterns/forms/option-card/option-card";
export {
  ResponsiveOptionSelect,
  type ResponsiveOptionSelectOption,
  type ResponsiveOptionSelectProps,
} from "./patterns/forms/responsive-option-select/responsive-option-select";

export {
  AvatarBadge,
  buildDefaultAvatarBadgeSrc,
  resolveAvatarBadgeSrc,
  type AvatarBadgeProps,
  type AvatarBadgeSize,
} from "./patterns/identity/avatar-badge/avatar-badge";

export {
  PirateBrandMark,
  type PirateBrandMarkProps,
} from "./patterns/identity/pirate-brand-mark/pirate-brand-mark";

export {
  CardShell,
  PageContainer,
  type PageContainerProps,
} from "./patterns/layout/layout-shell/layout-shell";
export {
  StackPageShell,
  type StackPageShellProps,
} from "./patterns/layout/stack-page-shell/stack-page-shell";

export {
  FlatTabBar,
  FlatTabButton,
  type FlatTabBarProps,
  type FlatTabButtonProps,
} from "./patterns/navigation/flat-tabs/flat-tabs";
export {
  StackedSectionNav,
  type StackedSectionNavItem,
  type StackedSectionNavProps,
  type StackedSectionNavSection,
} from "./patterns/navigation/stacked-section-nav/stacked-section-nav";
export {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  createSidebar,
  createSidebarSide,
  type SidebarContextValue,
  type SidebarMenuButtonProps,
  type SidebarProps,
  type SidebarProviderProps,
} from "./patterns/navigation/sidebar";
export {
  AppHeader,
  shouldShowDesktopConnectAction,
  shouldShowMobileConnectAction,
  type AppHeaderLabels,
  type AppHeaderProps,
} from "./patterns/navigation/app-header/app-header";
export {
  MobileFooterNav,
  type FooterNavItemId,
  type MobileFooterNavIcons,
  type MobileFooterNavLabels,
  type MobileFooterNavProps,
} from "./patterns/navigation/mobile-footer-nav/mobile-footer-nav";
export {
  MobilePageHeader,
  type MobilePageHeaderProps,
} from "./patterns/navigation/mobile-page-header/mobile-page-header";

export {
  ActionMenu,
  type ActionMenuGroup,
  type ActionMenuItem,
  type ActionMenuProps,
} from "./patterns/overlays/action-menu/action-menu";
export {
  ConfirmDialog,
  type ConfirmDialogProps,
} from "./patterns/overlays/confirm-dialog/confirm-dialog";
export {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
  type ModalContentProps,
  type ModalProps,
} from "./patterns/overlays/modal/modal";
