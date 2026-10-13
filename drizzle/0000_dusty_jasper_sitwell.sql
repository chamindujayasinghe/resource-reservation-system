CREATE TYPE "public"."reservation_status" AS ENUM('confirmed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."resource_type" AS ENUM('room', 'equipment', 'vehicle', 'other');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"attendee_count" integer,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"status" "reservation_status" DEFAULT 'confirmed' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservations_title_length" CHECK (char_length("reservations"."title") between 3 and 100),
	CONSTRAINT "reservations_attendee_count_positive" CHECK ("reservations"."attendee_count" > 0),
	CONSTRAINT "reservations_end_after_start" CHECK ("reservations"."end_at" > "reservations"."start_at"),
	CONSTRAINT "reservations_cancellation_consistent" CHECK (("reservations"."status" = 'cancelled' and "reservations"."cancelled_at" is not null and "reservations"."cancelled_by" is not null) or ("reservations"."status" = 'confirmed' and "reservations"."cancelled_at" is null and "reservations"."cancelled_by" is null))
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "resource_type" NOT NULL,
	"location" text NOT NULL,
	"capacity" integer,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resources_name_length" CHECK (char_length("resources"."name") between 1 and 100),
	CONSTRAINT "resources_capacity_positive" CHECK ("resources"."capacity" > 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_email_lowercase" CHECK ("users"."email" = lower("users"."email"))
);
--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reservations_resource_start_idx" ON "reservations" USING btree ("resource_id","start_at");--> statement-breakpoint
CREATE INDEX "reservations_user_start_idx" ON "reservations" USING btree ("user_id","start_at");--> statement-breakpoint
CREATE INDEX "reservations_start_idx" ON "reservations" USING btree ("start_at");--> statement-breakpoint
CREATE UNIQUE INDEX "resources_name_unique" ON "resources" USING btree (lower("name"));