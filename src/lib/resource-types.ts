import type { ResourceType } from "@/server/db/schema";

// Display labels, in the order dropdowns list them. Type-only import: safe to
// use from client components.
export const RESOURCE_TYPE_OPTIONS: readonly {
  value: ResourceType;
  label: string;
}[] = [
  { value: "room", label: "Room" },
  { value: "equipment", label: "Equipment" },
  { value: "vehicle", label: "Vehicle" },
  { value: "other", label: "Other" },
];

export function resourceTypeLabel(type: ResourceType): string {
  return (
    RESOURCE_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type
  );
}
