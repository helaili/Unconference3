ALTER TABLE "events" ADD COLUMN "min_stars" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "max_stars" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
CREATE TABLE "session_stars" (
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_stars_user_id_session_id_pk" PRIMARY KEY("user_id","session_id")
);
--> statement-breakpoint
ALTER TABLE "session_stars" ADD CONSTRAINT "session_stars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_stars" ADD CONSTRAINT "session_stars_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_stars" ADD CONSTRAINT "session_stars_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
