import type { Metadata } from "next";

import { createResourceAction } from "@/actions/resources";
import { ResourceForm } from "@/components/resource-form";
import { requireAdmin } from "@/server/auth/session";

export const metadata: Metadata = { title: "New resource" };

export default async function NewResourcePage() {
  await requireAdmin();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">New resource</h1>
      <ResourceForm
        action={createResourceAction}
        initialValues={{
          name: "",
          type: "",
          location: "",
          capacity: "",
          description: "",
        }}
        submitLabel="Create resource"
        successMessage="Resource created."
      />
    </div>
  );
}
