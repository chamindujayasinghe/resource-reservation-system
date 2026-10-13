import Link from "next/link";

import { signOutAction } from "@/actions/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AuthenticatedUser } from "@/server/services/users";

const NAV_LINKS = [{ href: "/resources", label: "Resources" }];

const ADMIN_NAV_LINKS = [
  { href: "/admin/resources", label: "Manage resources" },
];

export function AppHeader({ user }: { user: AuthenticatedUser }) {
  // Hiding links is for convenience only. Every admin page and action checks
  // the role again on the server.
  const links =
    user.role === "admin" ? [...NAV_LINKS, ...ADMIN_NAV_LINKS] : NAV_LINKS;

  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href="/resources" className="font-semibold">
            Resource Reservations
          </Link>
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <span className="text-sm">{user.name}</span>
          <Badge variant="secondary" className="capitalize">
            {user.role}
          </Badge>
          <form action={signOutAction}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
