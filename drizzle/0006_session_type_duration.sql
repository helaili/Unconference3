CREATE TYPE "public"."session_type" AS ENUM('discussion', 'workshop');--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "type" "session_type" NOT NULL DEFAULT 'discussion';--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "duration" integer;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "default_discussion_duration" integer NOT NULL DEFAULT 30;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "default_workshop_duration" integer NOT NULL DEFAULT 75;
