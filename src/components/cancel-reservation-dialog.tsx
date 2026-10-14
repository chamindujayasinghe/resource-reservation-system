"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";

import type { CancelReservationState } from "@/actions/reservations";
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

type CancelReservationDialogProps = {
  action: () => Promise<CancelReservationState>;
  // What is being cancelled, e.g. "Sprint planning, Boardroom, Wed 14 Oct
  // 2026 09:00-11:00".
  summary: string;
};

// M9: a confirmation step that states the consequence before cancelling.
export function CancelReservationDialog({
  action,
  summary,
}: CancelReservationDialogProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    async (): Promise<CancelReservationState> => {
      const result = await action();
      if (result?.ok) {
        toast.success("Reservation cancelled.");
        setOpen(false);
      }
      return result;
    },
    null,
  );
  const error = state && !state.ok ? state.error : undefined;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Cancel<span className="sr-only"> {summary}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this reservation?</DialogTitle>
          <DialogDescription>
            {summary}. The slot becomes free for others straight away. This
            cannot be undone; you would need to book again.
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
                Keep reservation
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? "Cancelling..." : "Cancel reservation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
