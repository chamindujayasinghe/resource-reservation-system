import { AppHeader } from "@/components/app-header";
import { requireUser } from "@/server/auth/session";

// Shell for every signed-in page. Pages still call requireUser() or
// requireAdmin() themselves: a layout does not re-run on client navigation,
// so it cannot be the only check.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {children}
      </main>
    </>
  );
}
