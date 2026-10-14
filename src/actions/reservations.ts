"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/server/auth/session";
import { createReservation } from "@/server/services/reservations";
import { reservationInputSchema } from "@/validation/reservations";
import { resourceIdSchema } from "@/validation/resources";

import {
  domainFailure,
  readFormValues,
  validationFailure,
  type ActionState,
} from "./action-state";

const RESERVATION_FIELDS = ["date", "start", "end", "title"] as const;

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
