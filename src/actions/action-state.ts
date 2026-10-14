import type { z } from "zod";

import { DomainError } from "@/server/errors";

// The result shape shared by every server action. Actions never throw to the
// client: an expected failure is returned as { ok: false, error }.
// Client components import only the types from this file.

export type ActionError = {
  // Shown above the submit button.
  message?: string;
  // Shown under the matching input, keyed by field name.
  fieldErrors?: Record<string, string>;
  // What the user submitted, so the form can be re-filled after a failure.
  values?: Record<string, string>;
};

export type ActionResult<Data = void> =
  { ok: true; data: Data } | { ok: false; error: ActionError };

// What a form holds between submissions: null until the first submit.
export type ActionState<Data = void> = ActionResult<Data> | null;

type Failure = { ok: false; error: ActionError };

// The named text fields of a form, with anything missing as "". Used both as
// the input to validation and as the values sent back to re-fill the form.
export function readFormValues(
  formData: FormData,
  fields: readonly string[],
): Record<string, string> {
  return Object.fromEntries(
    fields.map((field) => {
      const value = formData.get(field);
      return [field, typeof value === "string" ? value : ""];
    }),
  );
}

// A Zod failure as one message per field (the first, if there are several).
export function validationFailure(
  error: z.ZodError,
  values: Record<string, string>,
): Failure {
  const fieldErrors: Record<string, string> = {};

  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !(field in fieldErrors)) {
      fieldErrors[field] = issue.message;
    }
  }

  return {
    ok: false,
    error: {
      message: "Please correct the highlighted fields.",
      fieldErrors,
      values,
    },
  };
}

// An expected DomainError as a form error, attached to a field when it names
// one. Anything else is a bug or an outage: it is rethrown, never shown.
export function domainFailure(
  error: unknown,
  values: Record<string, string>,
): Failure {
  if (!(error instanceof DomainError)) {
    throw error;
  }

  return {
    ok: false,
    error: error.field
      ? { fieldErrors: { [error.field]: error.message }, values }
      : { message: error.message, values },
  };
}
