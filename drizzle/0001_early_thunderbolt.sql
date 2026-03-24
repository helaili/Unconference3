CREATE TYPE "public"."invitee_role" AS ENUM('participant', 'moderator', 'staff');--> statement-breakpoint
ALTER TABLE "invitees" ADD COLUMN "role" "invitee_role" DEFAULT 'participant' NOT NULL;