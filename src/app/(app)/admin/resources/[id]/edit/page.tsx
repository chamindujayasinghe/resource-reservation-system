import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { updateResourceAction } from "@/actions/resources";
import { ResourceForm } from "@/components/resource-form";
import { requireAdmin } from "@/server/auth/session";
import { getResource } from "@/server/services/resources";
import { resourceIdSchema } from "@/validation/resources";

export const metadata: Metadata = { title: "Edit resource" };

export default async function EditResourcePage({
  params,
}: PageProps<"/admin/resources/[id]/edit">) {
  const actor = await requireAdmin();
  const { id } = await params;

  const parsedId = resourceIdSchema.safeParse(id);
  if (!parsedId.success) {
    notFound();
  }

  const resource = await getResource(actor, parsedId.data);
  if (!resource) {
    notFound();
  }

  // The id is fixed on the server; the form cannot change which resource
  // it saves.
  const action = updateResourceAction.bind(null, resource.id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Edit {resource.name}</h1>
      <ResourceForm
        action={action}
        initialValues={{
          name: resource.name,
          type: resource.type,
          location: resource.location,
          capacity: resource.capacity?.toString() ?? "",
          description: resource.description ?? "",
        }}
        submitLabel="Save changes"
        successMessage="Resource updated."
      />
    </div>
  );
}
