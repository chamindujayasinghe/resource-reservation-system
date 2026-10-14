import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { resourceTypeLabel } from "@/lib/resource-types";
import { requireAdmin } from "@/server/auth/session";
import { listResources } from "@/server/services/resources";

export const metadata: Metadata = { title: "Manage resources" };

export default async function AdminResourcesPage() {
  // Members get the not-found page here, even if they type the URL.
  const actor = await requireAdmin();
  const resources = await listResources(actor, { includeInactive: true });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Manage resources</h1>
        <Button asChild>
          <Link href="/admin/resources/new">New resource</Link>
        </Button>
      </div>

      {resources.length === 0 ? (
        <p className="text-muted-foreground">
          No resources yet. Create the first one to make it bookable.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="text-right">Capacity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resources.map((resource) => (
              <TableRow key={resource.id}>
                <TableCell className="font-medium">{resource.name}</TableCell>
                <TableCell>{resourceTypeLabel(resource.type)}</TableCell>
                <TableCell>{resource.location}</TableCell>
                <TableCell className="text-right">
                  {resource.capacity ?? "-"}
                </TableCell>
                <TableCell>
                  {resource.isActive ? (
                    <Badge variant="secondary">Active</Badge>
                  ) : (
                    <Badge variant="outline">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/admin/resources/${resource.id}/edit`}>
                      Edit<span className="sr-only"> {resource.name}</span>
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
