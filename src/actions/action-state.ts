// The result shape shared by every server action. Actions never throw to the
// client: an expected failure is returned as { ok: false, error }.

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
