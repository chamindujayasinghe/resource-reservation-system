"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import type { ResourceActionState } from "@/actions/resources";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { RESOURCE_TYPE_OPTIONS } from "@/lib/resource-types";

export type ResourceFormValues = {
  name: string;
  type: string;
  location: string;
  capacity: string;
  description: string;
};

type ResourceFormProps = {
  action: (
    previous: ResourceActionState,
    formData: FormData,
  ) => Promise<ResourceActionState>;
  initialValues: ResourceFormValues;
  submitLabel: string;
  successMessage: string;
};

const ADMIN_LIST_PATH = "/admin/resources";

export function ResourceForm({
  action,
  initialValues,
  submitLabel,
  successMessage,
}: ResourceFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      toast.success(successMessage);
      router.push(ADMIN_LIST_PATH);
    }
  }, [state, router, successMessage]);

  const error = state && !state.ok ? state.error : undefined;
  // After a failed save, show what was submitted, not the original values.
  const values = { ...initialValues, ...error?.values };
  const fieldError = (field: keyof ResourceFormValues) =>
    error?.fieldErrors?.[field];

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-5">
      {error?.message ? (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : null}

      <FormField label="Name" htmlFor="name" error={fieldError("name")}>
        <Input
          id="name"
          name="name"
          required
          maxLength={100}
          defaultValue={values.name}
          aria-invalid={Boolean(fieldError("name"))}
          aria-describedby={fieldError("name") ? "name-error" : undefined}
        />
      </FormField>

      <FormField label="Type" htmlFor="type" error={fieldError("type")}>
        <NativeSelect
          id="type"
          name="type"
          required
          defaultValue={values.type}
          aria-invalid={Boolean(fieldError("type"))}
          aria-describedby={fieldError("type") ? "type-error" : undefined}
        >
          <option value="" disabled>
            Choose a type
          </option>
          {RESOURCE_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      </FormField>

      <FormField
        label="Location"
        htmlFor="location"
        error={fieldError("location")}
      >
        <Input
          id="location"
          name="location"
          required
          maxLength={100}
          placeholder="For example: Level 2"
          defaultValue={values.location}
          aria-invalid={Boolean(fieldError("location"))}
          aria-describedby={
            fieldError("location") ? "location-error" : undefined
          }
        />
      </FormField>

      <FormField
        label="Capacity (optional)"
        htmlFor="capacity"
        hint="Seats or passengers. Leave empty for equipment."
        error={fieldError("capacity")}
      >
        <Input
          id="capacity"
          name="capacity"
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          defaultValue={values.capacity}
          className="max-w-32"
          aria-invalid={Boolean(fieldError("capacity"))}
          aria-describedby={
            fieldError("capacity") ? "capacity-error" : "capacity-hint"
          }
        />
      </FormField>

      <FormField
        label="Description (optional)"
        htmlFor="description"
        error={fieldError("description")}
      >
        <Textarea
          id="description"
          name="description"
          maxLength={500}
          rows={3}
          defaultValue={values.description}
          aria-invalid={Boolean(fieldError("description"))}
          aria-describedby={
            fieldError("description") ? "description-error" : undefined
          }
        />
      </FormField>

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : submitLabel}
        </Button>
        <Button asChild variant="outline">
          <Link href={ADMIN_LIST_PATH}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
