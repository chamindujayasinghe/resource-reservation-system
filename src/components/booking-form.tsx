"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import type { ActionState } from "@/actions/action-state";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

type ReservationFormState = ActionState<{ id: string }>;

// Used to book (M6) and to edit (S1) a reservation.
type BookingFormProps = {
  action: (
    previous: ReservationFormState,
    formData: FormData,
  ) => Promise<ReservationFormState>;
  initialValues: {
    date: string;
    start?: string;
    end?: string;
    title?: string;
    attendeeCount?: string;
  };
  // Shown as a hint only; the server checks the count (BR16).
  capacity: number | null;
  submitLabel: string;
  pendingLabel: string;
  successMessage: string;
  // Where to go after success. Without it the form stays on the page.
  successHref?: string;
  // Limits for the date picker. A convenience only: the server applies the
  // real rules (BR2, BR7).
  minDate: string;
  maxDate: string;
  startTimes: readonly string[];
  endTimes: readonly string[];
  timeZoneLabel: string;
};

type Field = "date" | "start" | "end" | "title" | "attendeeCount";

export function BookingForm({
  action,
  initialValues,
  capacity,
  submitLabel,
  pendingLabel,
  successMessage,
  successHref,
  minDate,
  maxDate,
  startTimes,
  endTimes,
  timeZoneLabel,
}: BookingFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      toast.success(successMessage);
      if (successHref) {
        router.push(successHref);
      }
    }
  }, [state, successMessage, successHref, router]);

  const error = state && !state.ok ? state.error : undefined;
  // After a refusal, keep what the user chose (M6: input is preserved).
  const values = {
    start: "",
    end: "",
    title: "",
    attendeeCount: "",
    ...initialValues,
    ...error?.values,
  };
  const fieldError = (field: Field) => error?.fieldErrors?.[field];
  const describedBy = (field: Field) =>
    fieldError(field) ? `${field}-error` : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {error?.message ? (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : null}

      <FormField label="Date" htmlFor="date" error={fieldError("date")}>
        <Input
          id="date"
          name="date"
          type="date"
          required
          min={minDate}
          max={maxDate}
          defaultValue={values.date}
          aria-invalid={Boolean(fieldError("date"))}
          aria-describedby={describedBy("date")}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Start" htmlFor="start" error={fieldError("start")}>
          <NativeSelect
            id="start"
            name="start"
            required
            defaultValue={values.start}
            aria-invalid={Boolean(fieldError("start"))}
            aria-describedby={describedBy("start")}
          >
            <option value="" disabled>
              Choose
            </option>
            {startTimes.map((time) => (
              <option key={time} value={time}>
                {time}
              </option>
            ))}
          </NativeSelect>
        </FormField>

        <FormField label="End" htmlFor="end" error={fieldError("end")}>
          <NativeSelect
            id="end"
            name="end"
            required
            defaultValue={values.end}
            aria-invalid={Boolean(fieldError("end"))}
            aria-describedby={describedBy("end")}
          >
            <option value="" disabled>
              Choose
            </option>
            {endTimes.map((time) => (
              <option key={time} value={time}>
                {time}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      <p className="-mt-2 text-sm text-muted-foreground">
        Times are in {timeZoneLabel}.
      </p>

      <FormField
        label="Purpose"
        htmlFor="title"
        hint="Shown on the schedule, for example: Sprint planning"
        error={fieldError("title")}
      >
        <Input
          id="title"
          name="title"
          required
          minLength={3}
          maxLength={100}
          defaultValue={values.title}
          aria-invalid={Boolean(fieldError("title"))}
          aria-describedby={fieldError("title") ? "title-error" : "title-hint"}
        />
      </FormField>

      <FormField
        label="Attendees"
        htmlFor="attendeeCount"
        hint={
          capacity === null
            ? "Optional."
            : `Optional. Holds up to ${capacity} people.`
        }
        error={fieldError("attendeeCount")}
      >
        <Input
          id="attendeeCount"
          name="attendeeCount"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          defaultValue={values.attendeeCount}
          aria-invalid={Boolean(fieldError("attendeeCount"))}
          aria-describedby={
            fieldError("attendeeCount")
              ? "attendeeCount-error"
              : "attendeeCount-hint"
          }
        />
      </FormField>

      <Button type="submit" disabled={isPending}>
        {isPending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}
