CREATE TYPE "public"."round_status" AS ENUM('draft', 'assigned', 'open');--> statement-breakpoint
CREATE TABLE "rounds" (
"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
"event_id" uuid NOT NULL,
"name" varchar(255),
"duration" integer NOT NULL,
"start_time" timestamp,
"min_participants" integer DEFAULT 1 NOT NULL,
"status" "round_status" DEFAULT 'draft' NOT NULL,
"created_at" timestamp DEFAULT now() NOT NULL,
"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "round_rooms" (
"round_id" uuid NOT NULL,
"room_id" uuid NOT NULL,
CONSTRAINT "round_rooms_round_id_room_id_pk" PRIMARY KEY("round_id","room_id")
);
--> statement-breakpoint
CREATE TABLE "slots" (
"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
"round_id" uuid NOT NULL,
"room_id" uuid NOT NULL,
"session_id" uuid,
"slot_index" integer NOT NULL,
"created_at" timestamp DEFAULT now() NOT NULL,
CONSTRAINT "slots_round_id_room_id_slot_index_unique" UNIQUE("round_id","room_id","slot_index")
);
--> statement-breakpoint
CREATE TABLE "slot_registrations" (
"slot_id" uuid NOT NULL,
"user_id" uuid NOT NULL,
"created_at" timestamp DEFAULT now() NOT NULL,
CONSTRAINT "slot_registrations_slot_id_user_id_pk" PRIMARY KEY("slot_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_rooms" ADD CONSTRAINT "round_rooms_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_rooms" ADD CONSTRAINT "round_rooms_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_registrations" ADD CONSTRAINT "slot_registrations_slot_id_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_registrations" ADD CONSTRAINT "slot_registrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;
