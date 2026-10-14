import { z } from "zod";

import { resourceType } from "@/server/db/schema";

const MAX_CAPACITY = 10_000;

// Empty text inputs arrive as "", which the database should store as null.
const emptyToNull = (value: string) => (value === "" ? null : value);

// The create and edit form (M3). Every field arrives from FormData as text.
export const resourceInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name.")
    .max(100, "Use 100 characters or fewer."),
  type: z.enum(resourceType.enumValues, { error: "Choose a type." }),
  location: z
    .string()
    .trim()
    .min(1, "Enter a location.")
    .max(100, "Use 100 characters or fewer."),
  // BR14: optional, but a positive whole number when given.
  capacity: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^\d+$/.test(value),
      "Enter a whole number, or leave it empty.",
    )
    .transform((value) => (value === "" ? null : Number(value)))
    .refine(
      (value) => value === null || (value >= 1 && value <= MAX_CAPACITY),
      `Capacity must be between 1 and ${MAX_CAPACITY.toLocaleString("en")}.`,
    ),
  description: z
    .string()
    .trim()
    .max(500, "Use 500 characters or fewer.")
    .transform(emptyToNull),
});

export type ResourceInput = z.output<typeof resourceInputSchema>;

// ?type= and ?q= on the resource list. Anything invalid (an unknown type, a
// repeated parameter) is dropped, so the list falls back to no filter.
export const resourceFiltersSchema = z.object({
  type: z.enum(resourceType.enumValues).optional().catch(undefined),
  q: z
    .string()
    .trim()
    .max(100)
    .transform((value) => value || undefined)
    .optional()
    .catch(undefined),
});

export type ResourceFilters = z.output<typeof resourceFiltersSchema>;

// The [id] segment of a URL. A malformed id is treated as not found.
export const resourceIdSchema = z.uuid();
