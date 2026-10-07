import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Link } from "@tanstack/react-router";
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import type { LockState } from "./useSaveLock";

export function LockDialog({
  state,
  onTakeOver,
  onRetry,
}: {
  state: LockState;
  onTakeOver: () => void;
  onRetry: () => void;
}) {
  if (state.status === "held" || state.status === "acquiring") return null;
  const content =
    state.status === "conflict"
      ? {
          title: "Open on another device",
          body: `This save is open on ${state.heldBy.label}. Taking over closes it there; anything it hasn't saved yet will be lost.`,
          action: "Take over",
          onAction: onTakeOver,
        }
      : state.status === "lost"
        ? {
            title: "Taken over",
            body: `${state.heldBy?.label ?? "Another device"} took over this save, so the game here is paused. Taking it back reloads the latest save from NexusBody.`,
            action: "Take it back",
            onAction: onTakeOver,
          }
        : {
            title: "Couldn't open this save",
            body: state.message,
            action: "Try again",
            onAction: onRetry,
          };

  return (
    <Dialog open>
      <DialogPortal>
        <DialogOverlay className="bg-background/70 backdrop-blur-sm" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          className="tile fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 !bg-card p-5"
        >
          <DialogTitle className="text-lg font-bold">{content.title}</DialogTitle>
          <p className="mt-2 text-sm text-muted-foreground">{content.body}</p>
          <div className="mt-5 flex justify-end gap-2">
            <Link
              to="/"
              className="rounded-full border border-border bg-secondary px-4 py-2 text-sm hover:bg-accent"
            >
              Back to library
            </Link>
            <button
              onClick={content.onAction}
              className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/85"
            >
              {content.action}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
