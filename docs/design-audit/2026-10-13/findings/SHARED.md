# Shared (design-system) findings so far — attribute screen symptoms to these, don't re-report them per screen
F1 Type `overline` renders 16/24; Paper 16/20.
F2 ~106 transition utilities lack motion-reduce pairing.
F3 Sidebar animates layout properties (width/left/right/height/padding/transition-all).
F4 shadow-sm/md/lg/xl render Tailwind defaults: --shadow-* tokens are in :root but not mapped in @theme (Dialog, AlertDialog, Sheet, DropdownMenu, Tooltip, Popover-based surfaces).
F5 DropdownMenu content max-h-96 + overflow-hidden clips the last items; open menu shows browser focus outline.
F6 Sheet: side sheets stretch grid rows (body far below description); close X drawn that Paper omits (56px reserved padding).
F7 Tooltip opens below trigger with 0 gap (gutter passed to Content, not root).
F8 Select/Combobox/MultiCombobox popovers sit 8px below the field; Paper 4px.
F9 RadioGroup has no horizontal segmented orientation; description/error render inside the track.
F10 Input/Textarea flat variants keep padding; Textarea shows native resize grip.
F11 AutoResizeTextarea renders unstyled (measured; cause unconfirmed).
F12 MultiCombobox chips are full pills (Paper: radius-md), caret wraps, placeholder beside chips.
F13 Button icon-size loading shows child + spinner (Paper: spinner only).
F14 ItemMedia has no failed-image fallback.
Owner-decision candidates so far: FormattedText autolinking bare URLs; Label "Optional" example vs Paper ruling 10.
Pending owner decisions (do not resolve): member Unfollow, visitor Profile button, reply loading.
Patterns audit (findings/patterns.md) is still running — read it if present before finalising.
F15 FlatTabs stretches desktop tabs (624px each at 1280) against owner ruling 5; live community page compensates locally.
F16 FormattedTextarea px-0 (Paper 16px) — also the live comment composer.
F17 ConfirmDialog stories non-destructive; Paper always destructive.
F18 Modal description foreground (Paper muted); phone sheet close X.
F19 Pointer-opened menus show browser focus outline (DropdownMenu, ActionMenu).
F20 Owner ruling 1 deletion, verified against imports at 67d6b7a: ActionBanner, IllustratedState, StatusCard, ListRow, MediaUploadField, AvatarBadge, StackPageShell, StackedSectionNav have no production importer (deletable; CardShell only used by StackPageShell). AppHeader (media-shell.tsx) and Sidebar primitives (media-shell.tsx, app-sidebar.tsx) ARE live — the ruling's "no caller" premise is false for them: owner clarification needed, do not delete.
