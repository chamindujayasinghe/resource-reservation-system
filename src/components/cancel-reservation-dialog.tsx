"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";

import type { CancelReservationState } from "@/actions/reservations";
import { FormField } from "@/components/form-field";
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
import { Textarea } from "@/components/ui/textarea";

type CancelReservationDialogProps = {
  action: (
    previous: CancelReservationState,
    formData: FormData,
  ) => Promise<CancelReservationState>;
  // What is being cancelled, e.g. "Sprint planning, Boardroom, Wed 14 Oct
  // 2026, 09:00-11:00".
  summary: string;
  // An admin cancelling someone else's reservation must say why (BR23).
  requireReason?: boolean;
};

// M9 and M10: a confirmation step that states the consequence before
// cancelling, with a reason when an admin cancels for someone else.
export function CancelReservationDialog({
  action,
  summary,
  requireReason = false,
}: CancelReservationDialogProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    async (
      previous: CancelReservationState,
      formData: FormData,
    ): Promise<CancelReservationState> => {
      const result = await action(previous, formData);
      if (result?.ok) {
        toast.success("Reservation cancelled.");
        setOpen(false);
      }
      return result;
    },
    null,
  );
  const error = state && !state.ok ? state.error : undefined;
  const reasonError = error?.fieldErrors?.reason;

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
            cannot be undone
            {requireReason
              ? "; the owner will see your reason in their reservations."
              : "; you would need to book again."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          {error?.message && !reasonError ? (
            <Alert variant="destructive">
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          ) : null}

          {requireReason ? (
            <FormField label="Reason" htmlFor="reason" error={reasonError}>
              <Textarea
                id="reason"
                name="reason"
                required
                minLength={3}
                maxLength={200}
                rows={3}
                defaultValue={error?.values?.reason}
                aria-invalid={Boolean(reasonError)}
                aria-describedby={reasonError ? "reason-error" : undefined}
              />
            </FormField>
          ) : null}

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
