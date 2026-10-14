"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";

import type { ActionState } from "@/actions/action-state";
import type { DeactivateResourceState } from "@/actions/resources";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type ResourceStatusDialogProps =
  | {
      mode: "deactivate";
      resourceName: string;
      // Counted when the page loaded; the toast reports the real number.
      upcomingCount: number;
      action: () => Promise<DeactivateResourceState>;
    }
  | {
      mode: "reactivate";
      resourceName: string;
      action: () => Promise<ActionState>;
    };

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

// M4: deactivation states its consequences and needs explicit confirmation.
export function ResourceStatusDialog(props: ResourceStatusDialogProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    async (): Promise<ActionState<unknown>> => {
      if (props.mode === "deactivate") {
        const result = await props.action();
        if (result?.ok) {
          const { cancelledCount } = result.data;
          toast.success(
            cancelledCount === 0
              ? `${props.resourceName} deactivated.`
              : `${props.resourceName} deactivated. ${plural(cancelledCount, "reservation")} cancelled.`,
          );
          setOpen(false);
        }
        return result;
      }

      const result = await props.action();
      if (result?.ok) {
        toast.success(`${props.resourceName} reactivated.`);
        setOpen(false);
      }
      return result;
    },
    null,
  );
  const error = state && !state.ok ? state.error : undefined;

  const isDeactivate = props.mode === "deactivate";
  const upcoming = isDeactivate ? props.upcomingCount : 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={isDeactivate ? "ghost" : "outline"} size="sm">
          {isDeactivate ? "Deactivate" : "Reactivate"}
          <span className="sr-only"> {props.resourceName}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isDeactivate ? "Deactivate" : "Reactivate"} {props.resourceName}?
          </DialogTitle>
          <DialogDescription asChild>
            {isDeactivate ? (
              <div className="flex flex-col gap-2">
                <p>Members will no longer see or be able to book it.</p>
                <p className="font-medium text-foreground">
                  {upcoming === 0
                    ? "It has no upcoming reservations."
                    : `${plural(upcoming, "upcoming reservation")} will be cancelled with the reason "Resource deactivated". Their owners will see this in their reservations.`}
                </p>
                <p>
                  Past and in-progress reservations are kept. Reactivating later
                  does not restore cancelled reservations.
                </p>
              </div>
            ) : (
              <p>
                Members will be able to see and book it again. Reservations
                cancelled when it was deactivated stay cancelled.
              </p>
            )}
          </DialogDescription>
        </DialogHeader>

        {error?.message ? (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}

        <form action={formAction}>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Keep as it is
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant={isDeactivate ? "destructive" : "default"}
              disabled={isPending}
            >
              {isPending
                ? "Saving..."
                : isDeactivate
                  ? upcoming === 0
                    ? "Deactivate"
                    : `Deactivate and cancel ${upcoming}`
                  : "Reactivate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
