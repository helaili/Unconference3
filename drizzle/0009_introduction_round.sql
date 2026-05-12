CREATE TYPE "public"."intro_round_status" AS ENUM('draft', 'open', 'closed');--> statement-breakpoint
CREATE TABLE "introduction_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"num_slots" integer DEFAULT 2 NOT NULL,
	"group_size" integer DEFAULT 10 NOT NULL,
	"status" "intro_round_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "introduction_rounds_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "introduction_slot_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intro_round_id" uuid NOT NULL,
	"slot_index" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	CONSTRAINT "introduction_slot_assignments_intro_round_id_slot_index_user_id_unique" UNIQUE("intro_round_id","slot_index","user_id")
);
--> statement-breakpoint
ALTER TABLE "introduction_rounds" ADD CONSTRAINT "introduction_rounds_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "introduction_slot_assignments" ADD CONSTRAINT "introduction_slot_assignments_intro_round_id_introduction_rounds_id_fk" FOREIGN KEY ("intro_round_id") REFERENCES "public"."introduction_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "introduction_slot_assignments" ADD CONSTRAINT "introduction_slot_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "introduction_slot_assignments" ADD CONSTRAINT "introduction_slot_assignments_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;