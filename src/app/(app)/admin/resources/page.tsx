import type { Metadata } from "next";
import Link from "next/link";

import {
  deactivateResourceAction,
  reactivateResourceAction,
} from "@/actions/resources";
import { ResourceStatusDialog } from "@/components/resource-status-dialog";
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
import {
  countUpcomingReservations,
  listResources,
} from "@/server/services/resources";

export const metadata: Metadata = { title: "Manage resources" };

export default async function AdminResourcesPage() {
  // Members get the not-found page here, even if they type the URL.
  const actor = await requireAdmin();
  const [resources, upcomingCounts] = await Promise.all([
    listResources(actor, { includeInactive: true }),
    countUpcomingReservations(actor),
  ]);

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
              <TableHead className="text-right">Upcoming</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resources.map((resource) => {
              const upcoming = upcomingCounts.get(resource.id) ?? 0;

              return (
                <TableRow key={resource.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/resources/${resource.id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {resource.name}
                    </Link>
                  </TableCell>
                  <TableCell>{resourceTypeLabel(resource.type)}</TableCell>
                  <TableCell>{resource.location}</TableCell>
                  <TableCell className="text-right">
                    {resource.capacity ?? "-"}
                  </TableCell>
                  <TableCell className="text-right">{upcoming}</TableCell>
                  <TableCell>
                    {resource.isActive ? (
                      <Badge variant="secondary">Active</Badge>
                    ) : (
                      <Badge variant="outline">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/admin/resources/${resource.id}/edit`}>
                          Edit<span className="sr-only"> {resource.name}</span>
                        </Link>
                      </Button>
                      {resource.isActive ? (
                        <ResourceStatusDialog
                          mode="deactivate"
                          resourceName={resource.name}
                          upcomingCount={upcoming}
                          action={deactivateResourceAction.bind(
                            null,
                            resource.id,
                          )}
                        />
                      ) : (
                        <ResourceStatusDialog
                          mode="reactivate"
                          resourceName={resource.name}
                          action={reactivateResourceAction.bind(
                            null,
                            resource.id,
                          )}
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
