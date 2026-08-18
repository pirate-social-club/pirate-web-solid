import {
  Toast as KToast,
  toaster,
  type ToastComponentProps,
} from "@kobalte/core/toast";
import { Show } from "solid-js";

import { IconX } from "@/components/media/icons";
import { cn } from "@/lib/cn";

export type ToastType = "success" | "error" | "warning" | "info" | "default";

export interface ShowToastOptions {
  title: string;
  description?: string;
  type?: ToastType;
  duration?: number;
  persistent?: boolean;
  /**
   * Announcement priority. Defaults to polite for ordinary feedback and
   * assertive for error toasts, which are the ones allowed to interrupt
   * assistive technology.
   */
  priority?: "high" | "low";
}

const typeClasses: Record<ToastType, string> = {
  success: "border-success/20 bg-primary-subtle",
  error: "border-destructive/25 bg-card",
  warning: "border-warning/20 bg-card",
  info: "border-info/20 bg-card",
  default: "border-border-soft bg-card",
};

const typeAccentClasses: Record<ToastType, string> = {
  success: "bg-success",
  error: "bg-destructive",
  warning: "bg-warning",
  info: "bg-info",
  default: "bg-primary",
};

function ToastBody(props: ToastComponentProps & ShowToastOptions) {
  return (
    <KToast
      as="div"
      toastId={props.toastId}
      duration={props.duration}
      persistent={props.persistent}
      priority={props.priority ?? (props.type === "error" ? "high" : "low")}
      class={cn(
        "relative flex w-full items-start gap-3 overflow-hidden rounded-[var(--radius-xl)] border p-4 pe-10 shadow-[var(--shadow-lg)] backdrop-blur-md",
        typeClasses[props.type ?? "default"],
      )}
    >
      <span
        aria-hidden="true"
        class={cn(
          "mt-0.5 inline-block size-2 shrink-0 rounded-full",
          typeAccentClasses[props.type ?? "default"],
        )}
      />
      <div class="flex min-w-0 flex-col gap-0.5">
        <KToast.Title class="break-words text-base font-semibold text-foreground">
          {props.title}
        </KToast.Title>
        <Show when={props.description}>
          <KToast.Description class="break-words text-base text-muted-foreground">
            {props.description}
          </KToast.Description>
        </Show>
      </div>
      <KToast.CloseButton
        aria-label="Close"
        class="absolute end-3 top-3 inline-flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <IconX class="size-4" />
      </KToast.CloseButton>
    </KToast>
  );
}

export function Toaster() {
  return (
    <KToast.Region class="fixed inset-x-4 bottom-4 z-[60] flex flex-col gap-2 sm:inset-x-auto sm:end-4 sm:w-96">
      <KToast.List as="div" class="flex flex-col gap-2" />
    </KToast.Region>
  );
}

export const toast = {
  show(options: ShowToastOptions): number {
    const ToastComponent = (componentProps: ToastComponentProps) => (
      <ToastBody {...componentProps} {...options} />
    );
    return toaster.show(ToastComponent);
  },
  success(title: string, options?: Omit<ShowToastOptions, "title" | "type">) {
    return toast.show({ title, type: "success", ...options });
  },
  error(title: string, options?: Omit<ShowToastOptions, "title" | "type">) {
    return toast.show({ title, type: "error", ...options });
  },
  warning(title: string, options?: Omit<ShowToastOptions, "title" | "type">) {
    return toast.show({ title, type: "warning", ...options });
  },
  info(title: string, options?: Omit<ShowToastOptions, "title" | "type">) {
    return toast.show({ title, type: "info", ...options });
  },
  dismiss: toaster.dismiss,
  clear: toaster.clear,
};
