import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

// Shown for unknown URLs and whenever a page calls notFound(): a missing
// resource or reservation, or a page the user may not open (plan 5.4). The
// same message in every case, so it reveals nothing about what exists.
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">
        This page does not exist, or you do not have access to it.
      </p>
      <Button asChild>
        <Link href="/resources">Go to resources</Link>
      </Button>
    </main>
  );
}
