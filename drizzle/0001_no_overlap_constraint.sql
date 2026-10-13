-- Guarantees BR8 to BR10: no two confirmed reservations of the same resource
-- may overlap. Never remove or weaken this constraint.

-- Lets a GiST index compare plain uuid values for equality.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint

ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_no_overlap"
  EXCLUDE USING gist (
    "resource_id" WITH =,
    tstzrange("start_at", "end_at", '[)') WITH &&
  )
  WHERE ("status" = 'confirmed');
