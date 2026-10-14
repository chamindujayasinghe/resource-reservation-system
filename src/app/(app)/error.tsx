"use client";

import { Button } from "@/components/ui/button";

// Error boundaries must be Client Components. Shown inside the app layout
// when a signed-in page fails to render. The error itself is never displayed:
// the details stay in the server log (plan 5.4).
export default function AppError({ retry }: { retry: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-12 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground">
        This page could not be loaded. Please try again.
      </p>
      <Button onClick={() => retry()}>Try again</Button>
    </div>
  );
}
