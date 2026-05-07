ALTER TABLE "rounds" ADD COLUMN "break_duration" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TYPE "public"."round_status" ADD VALUE 'closed';
