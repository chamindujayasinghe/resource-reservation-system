import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { RESOURCE_TYPE_OPTIONS, resourceTypeLabel } from "@/lib/resource-types";
import { requireUser } from "@/server/auth/session";
import { listResources } from "@/server/services/resources";
import { resourceFiltersSchema } from "@/validation/resources";

export const metadata: Metadata = { title: "Resources" };

const LIST_PATH = "/resources";

export default async function ResourcesPage({
  searchParams,
}: PageProps<"/resources">) {
  const actor = await requireUser();
  // Filters live in the URL, so a filtered list can be bookmarked and the
  // back button works. Invalid values fall back to no filter.
  const filters = resourceFiltersSchema.parse(await searchParams);
  const resources = await listResources(actor, filters);
  const isFiltered = Boolean(filters.type || filters.q);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Resources</h1>

      <Form
        action={LIST_PATH}
        role="search"
        className="flex flex-wrap items-end gap-3"
      >
        <div className="flex min-w-48 flex-1 flex-col gap-2">
          <Label htmlFor="q">Search by name</Label>
          <Input id="q" name="q" type="search" defaultValue={filters.q} />
        </div>
        <div className="flex w-44 flex-col gap-2">
          <Label htmlFor="type">Type</Label>
          <NativeSelect id="type" name="type" defaultValue={filters.type ?? ""}>
            <option value="">All types</option>
            {RESOURCE_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {isFiltered ? (
          <Button asChild variant="ghost">
            <Link href={LIST_PATH}>Clear filters</Link>
          </Button>
        ) : null}
      </Form>

      {resources.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="font-medium">
            {isFiltered
              ? "No resources match your filters."
              : "No resources are available yet."}
          </p>
          {isFiltered ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Try another name or type, or{" "}
              <Link href={LIST_PATH} className="underline">
                clear the filters
              </Link>
              .
            </p>
          ) : null}
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {resources.map((resource) => (
            <li key={resource.id}>
              <Link
                href={`/resources/${resource.id}`}
                className="block h-full rounded-xl focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <Card className="h-full transition-colors hover:border-foreground/30">
                  <CardHeader>
                    <CardTitle>{resource.name}</CardTitle>
                    <CardDescription>
                      {resourceTypeLabel(resource.type)} · {resource.location}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-1 text-sm">
                    {resource.capacity ? (
                      <p>Capacity: {resource.capacity}</p>
                    ) : null}
                    {resource.description ? (
                      <p className="line-clamp-2 text-muted-foreground">
                        {resource.description}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
