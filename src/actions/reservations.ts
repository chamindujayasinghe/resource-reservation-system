"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/server/auth/session";
import {
  cancelReservation,
  createReservation,
  updateReservation,
} from "@/server/services/reservations";
import {
  cancellationReasonSchema,
  reservationIdSchema,
  reservationInputSchema,
} from "@/validation/reservations";
import { resourceIdSchema } from "@/validation/resources";

import {
  domainFailure,
  readFormValues,
  validationFailure,
  type ActionState,
} from "./action-state";

const RESERVATION_FIELDS = [
  "date",
  "start",
  "end",
  "title",
  "attendeeCount",
] as const;

export type CreateReservationState = ActionState<{ id: string }>;

// The page binds the resource id as the first argument. The owner is always
// the signed-in user; nothing in the form can change it.
export async function createReservationAction(
  resourceId: string,
  _previous: CreateReservationState,
  formData: FormData,
): Promise<CreateReservationState> {
  const actor = await requireUser();
  const values = readFormValues(formData, RESERVATION_FIELDS);

  const parsedResourceId = resourceIdSchema.safeParse(resourceId);
  if (!parsedResourceId.success) {
    return {
      ok: false,
      error: { message: "That resource does not exist.", values },
    };
  }

  const parsed = reservationInputSchema.safeParse(values);
  if (!parsed.success) {
    return validationFailure(parsed.error, values);
  }

  try {
    const reservation = await createReservation(
      actor,
      parsedResourceId.data,
      parsed.data,
    );
    revalidatePath(`/resources/${parsedResourceId.data}`);
    revalidatePath("/reservations");
    return { ok: true, data: { id: reservation.id } };
  } catch (error) {
    // The slot may have been taken since the page loaded. Refresh the
    // schedule so the booking that won shows next to the message.
    revalidatePath(`/resources/${parsedResourceId.data}`);
    return domainFailure(error, values);
  }
}

export type UpdateReservationState = ActionState<{ id: string }>;

// S1. The page binds the reservation id. The service checks ownership; the
// resource cannot be changed, so the form has no field for it.
export async function updateReservationAction(
  reservationId: string,
  _previous: UpdateReservationState,
  formData: FormData,
): Promise<UpdateReservationState> {
  const actor = await requireUser();
  const values = readFormValues(formData, RESERVATION_FIELDS);

  const parsedId = reservationIdSchema.safeParse(reservationId);
  if (!parsedId.success) {
    return {
      ok: false,
      error: { message: "That reservation does not exist.", values },
    };
  }

  const parsed = reservationInputSchema.safeParse(values);
  if (!parsed.success) {
    return validationFailure(parsed.error, values);
  }

  try {
    const reservation = await updateReservation(
      actor,
      parsedId.data,
      parsed.data,
    );
    revalidateAfterChange();
    return { ok: true, data: { id: reservation.id } };
  } catch (error) {
    // The slot may have been taken, or the reservation cancelled, since the
    // page loaded.
    revalidateAfterChange();
    return domainFailure(error, values);
  }
}

export type CancelReservationState = ActionState;

// M9. The page binds the reservation id. The form carries no fields, so the
// previous state and form data React also passes are not needed.
export async function cancelReservationAction(
  reservationId: string,
): Promise<CancelReservationState> {
  const actor = await requireUser();

  const parsedId = reservationIdSchema.safeParse(reservationId);
  if (!parsedId.success) {
    return {
      ok: false,
      error: { message: "That reservation does not exist." },
    };
  }

  try {
    await cancelReservation(actor, parsedId.data);
    revalidateAfterChange();
    return { ok: true, data: undefined };
  } catch (error) {
    // "Already cancelled" or "already started" means the page was out of
    // date, so refresh it as well.
    revalidateAfterChange();
    return domainFailure(error, {});
  }
}

const adminCancelSchema = z.object({ reason: cancellationReasonSchema });

// M10. An admin cancels any upcoming reservation. The form carries the
// reason; the service decides whether one is required (BR23).
export async function adminCancelReservationAction(
  reservationId: string,
  _previous: CancelReservationState,
  formData: FormData,
): Promise<CancelReservationState> {
  const actor = await requireUser();
  const values = readFormValues(formData, ["reason"]);

  const parsedId = reservationIdSchema.safeParse(reservationId);
  if (!parsedId.success) {
    return {
      ok: false,
      error: { message: "That reservation does not exist.", values },
    };
  }

  const parsed = adminCancelSchema.safeParse(values);
  if (!parsed.success) {
    return validationFailure(parsed.error, values);
  }

  try {
    await cancelReservation(actor, parsedId.data, {
      reason: parsed.data.reason,
    });
    revalidateAfterChange();
    return { ok: true, data: undefined };
  } catch (error) {
    revalidateAfterChange();
    return domainFailure(error, values);
  }
}

// After an edit or a cancel: both reservation lists and every resource
// schedule, so a freed or newly taken slot shows correctly wherever it is
// displayed.
function revalidateAfterChange(): void {
  revalidatePath("/reservations");
  revalidatePath("/admin/reservations");
  revalidatePath("/resources/[id]", "page");
}
