import type { Metadata } from "next";

import { requireAdmin } from "@/server/auth/session";

export const metadata: Metadata = { title: "Manage resources" };

export default async function AdminResourcesPage() {
  // Members get the not-found page here, even if they type the URL.
  await requireAdmin();

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">Manage resources</h1>
      <p className="text-muted-foreground">
        Admins only. Resource management is built in the next phase.
      </p>
    </div>
  );
}
