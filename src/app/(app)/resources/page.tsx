import type { Metadata } from "next";

import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Resources" };

export default async function ResourcesPage() {
  const user = await requireUser();

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">Resources</h1>
      <p className="text-muted-foreground">
        Signed in as {user.name}. The resource catalogue is built in the next
        phase.
      </p>
    </div>
  );
}
