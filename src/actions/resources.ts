"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/server/auth/session";
import {
  createResource,
  deactivateResource,
  reactivateResource,
  updateResource,
} from "@/server/services/resources";
import { resourceIdSchema, resourceInputSchema } from "@/validation/resources";

import {
  domainFailure,
  readFormValues,
  validationFailure,
  type ActionState,
} from "./action-state";

const RESOURCE_FIELDS = [
  "name",
  "type",
  "location",
  "capacity",
  "description",
] as const;

export type ResourceActionState = ActionState<{ id: string }>;

function revalidateResourcePages(): void {
  revalidatePath("/resources");
  revalidatePath("/admin/resources");
}

export async function createResourceAction(
  _previous: ResourceActionState,
  formData: FormData,
): Promise<ResourceActionState> {
  const actor = await requireUser();
  const values = readFormValues(formData, RESOURCE_FIELDS);

  const parsed = resourceInputSchema.safeParse(values);
  if (!parsed.success) {
    return validationFailure(parsed.error, values);
  }

  try {
    const resource = await createResource(actor, parsed.data);
    revalidateResourcePages();
    return { ok: true, data: { id: resource.id } };
  } catch (error) {
    return domainFailure(error, values);
  }
}

// The page binds the resource id as the first argument.
export async function updateResourceAction(
  id: string,
  _previous: ResourceActionState,
  formData: FormData,
): Promise<ResourceActionState> {
  const actor = await requireUser();
  const values = readFormValues(formData, RESOURCE_FIELDS);

  const parsedId = resourceIdSchema.safeParse(id);
  if (!parsedId.success) {
    return {
      ok: false,
      error: { message: "That resource no longer exists.", values },
    };
  }

  const parsed = resourceInputSchema.safeParse(values);
  if (!parsed.success) {
    return validationFailure(parsed.error, values);
  }

  try {
    const resource = await updateResource(actor, parsedId.data, parsed.data);
    revalidateResourcePages();
    return { ok: true, data: { id: resource.id } };
  } catch (error) {
    return domainFailure(error, values);
  }
}

const RESOURCE_NOT_FOUND: ActionState<never> = {
  ok: false,
  error: { message: "That resource no longer exists." },
};

// Everything that shows a resource or its reservations.
function revalidateAfterStatusChange(): void {
  revalidateResourcePages();
  revalidatePath("/resources/[id]", "page");
  revalidatePath("/reservations");
  revalidatePath("/admin/reservations");
}

export type DeactivateResourceState = ActionState<{ cancelledCount: number }>;

// M4. The page binds the resource id; the dialog has no fields.
export async function deactivateResourceAction(
  resourceId: string,
): Promise<DeactivateResourceState> {
  const actor = await requireUser();

  const parsedId = resourceIdSchema.safeParse(resourceId);
  if (!parsedId.success) {
    return RESOURCE_NOT_FOUND;
  }

  try {
    const { cancelledCount } = await deactivateResource(actor, parsedId.data);
    revalidateAfterStatusChange();
    return { ok: true, data: { cancelledCount } };
  } catch (error) {
    return domainFailure(error, {});
  }
}

export async function reactivateResourceAction(
  resourceId: string,
): Promise<ActionState> {
  const actor = await requireUser();

  const parsedId = resourceIdSchema.safeParse(resourceId);
  if (!parsedId.success) {
    return RESOURCE_NOT_FOUND;
  }

  try {
    await reactivateResource(actor, parsedId.data);
    revalidateAfterStatusChange();
    return { ok: true, data: undefined };
  } catch (error) {
    return domainFailure(error, {});
  }
}
