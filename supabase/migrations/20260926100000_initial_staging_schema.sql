-- Initial staging schema for Shinny Manager.
-- Generated from the user-provided, schema-only snapshot of production.
-- No production rows are included. Existing permissive policies are intentionally omitted.
-- RLS is enabled on every table and all API role table/sequence privileges are revoked.

begin;

-- Prevent future tables in this schema from receiving broad default API access.
alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from public, anon, authenticated;

create sequence if not exists public."draft_sessions_id_seq";
create sequence if not exists public."leagues_id_seq";
create sequence if not exists public."player_credits_id_seq";
create sequence if not exists public."players_id_seq";
create sequence if not exists public."registrants_id_seq";
create sequence if not exists public."skate_registrations_id_seq";
create sequence if not exists public."skates_id_seq";
create sequence if not exists public."teams_id_seq";

create table if not exists public."attendance" (
  "id" bigint not null,
  "player_id" bigint,
  "skate_id" bigint,
  "attended_at" timestamp with time zone default now(),
  constraint "attendance_pkey" PRIMARY KEY (id),
  constraint "attendance_player_id_skate_id_key" UNIQUE (player_id, skate_id)
);


create table if not exists public."classes" (
  "id" bigint not null,
  "season_id" bigint,
  "name" text not null,
  "created_at" timestamp with time zone default now(),
  constraint "classes_pkey" PRIMARY KEY (id)
);


create table if not exists public."draft_picks" (
  "id" bigint not null,
  "league_id" bigint,
  "team_id" bigint,
  "registrant_id" bigint,
  "pick_number" integer not null,
  "round" integer not null,
  "created_at" timestamp without time zone default now(),
  constraint "draft_picks_pkey" PRIMARY KEY (id)
);


create table if not exists public."draft_sessions" (
  "id" bigint default nextval('draft_sessions_id_seq'::regclass) not null,
  "league_id" bigint,
  "status" text default 'pending'::text,
  "current_pick" integer default 1,
  "timer_seconds" integer,
  "timer_started_at" timestamp without time zone,
  "created_at" timestamp without time zone default now(),
  constraint "draft_sessions_pkey" PRIMARY KEY (id)
);


create table if not exists public."friend_group_members" (
  "id" bigint not null,
  "friend_group_id" bigint,
  "player_id" bigint,
  constraint "friend_group_members_friend_group_id_player_id_key" UNIQUE (friend_group_id, player_id),
  constraint "friend_group_members_pkey" PRIMARY KEY (id)
);


create table if not exists public."friend_groups" (
  "id" bigint not null,
  "class_id" bigint,
  "name" text,
  "created_at" timestamp with time zone default now(),
  constraint "friend_groups_pkey" PRIMARY KEY (id)
);


create table if not exists public."jersey_inventory" (
  "id" bigint not null,
  "class_id" bigint,
  "team_name" text,
  "size" text,
  "quantity" integer default 0,
  constraint "jersey_inventory_class_id_team_name_size_key" UNIQUE (class_id, team_name, size),
  constraint "jersey_inventory_pkey" PRIMARY KEY (id),
  constraint "jersey_inventory_size_check" CHECK ((size = ANY (ARRAY['M'::text, 'L'::text, 'XL'::text, '2XL'::text, 'G2XL'::text])))
);


create table if not exists public."leagues" (
  "id" bigint default nextval('leagues_id_seq'::regclass) not null,
  "name" text not null,
  "season" text,
  "status" text default 'active'::text,
  "created_at" timestamp without time zone default now(),
  "updated_at" timestamp without time zone default now(),
  "gm_code" text,
  "commissioner_code" text,
  "skaters_per_team" integer default 4,
  "goalies_per_team" integer default 1,
  constraint "leagues_pkey" PRIMARY KEY (id)
);


create table if not exists public."player_credits" (
  "id" integer default nextval('player_credits_id_seq'::regclass) not null,
  "player_id" integer not null,
  "amount" numeric not null,
  "reason" text not null,
  "source_skate_id" integer,
  "status" text default 'active'::text,
  "created_by" text,
  "created_at" timestamp without time zone default now(),
  "used_on_skate_id" integer,
  "used_at" timestamp without time zone,
  "used_by" text,
  "notes" text,
  "last_activity_at" timestamp with time zone default now(),
  constraint "player_credits_pkey" PRIMARY KEY (id),
  constraint "player_credits_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'used'::text, 'expired'::text])))
);

CREATE INDEX idx_credits_created_at ON public.player_credits USING btree (created_at DESC);
CREATE INDEX idx_credits_player_id ON public.player_credits USING btree (player_id);
CREATE INDEX idx_credits_status ON public.player_credits USING btree (status);

create table if not exists public."player_skills" (
  "id" bigint not null,
  "player_id" bigint not null,
  "skating_balance" numeric,
  "skating_strides" numeric,
  "skating_direction_change" numeric,
  "skating_pivots" numeric,
  "skating_zone_entry" numeric,
  "skating_off_wall" numeric,
  "skating_corners" numeric,
  "skating_punch_turns" numeric,
  "skating_mohawks" numeric,
  "skating_backwards_basic" numeric,
  "skating_backwards_crossovers" numeric,
  "puck_shooting" numeric,
  "puck_passing" numeric,
  "puck_stickhandling" numeric,
  "puck_receiving" numeric,
  "puck_protection" numeric,
  "iq_positioning" numeric,
  "iq_reads_anticipation" numeric,
  "iq_defensive_awareness" numeric,
  "iq_offensive_awareness" numeric,
  "iq_transition" numeric,
  "compete_level" numeric,
  "compete_battle_wins" numeric,
  "compete_effort" numeric,
  "compete_resilience" numeric,
  "readiness_conditioning" numeric,
  "readiness_consistency" numeric,
  "updated_at" timestamp with time zone default now(),
  constraint "player_skills_pkey" PRIMARY KEY (id),
  constraint "player_skills_player_id_key" UNIQUE (player_id)
);


create table if not exists public."player_skills_simple" (
  "id" bigint not null,
  "player_id" bigint not null,
  "skating" numeric,
  "puck_skills" numeric,
  "hockey_iq" numeric,
  "competitiveness" numeric,
  "game_readiness" numeric,
  "updated_at" timestamp with time zone default now(),
  constraint "player_skills_simple_pkey" PRIMARY KEY (id),
  constraint "player_skills_simple_player_id_key" UNIQUE (player_id)
);


create table if not exists public."player_team_assignments" (
  "id" bigint not null,
  "team_assignment_id" bigint,
  "player_id" bigint,
  "team_name" text,
  "jersey_size" text,
  "created_at" timestamp with time zone default now(),
  constraint "player_team_assignments_jersey_size_check" CHECK ((jersey_size = ANY (ARRAY['M'::text, 'L'::text, 'XL'::text, '2XL'::text, 'G2XL'::text]))),
  constraint "player_team_assignments_pkey" PRIMARY KEY (id)
);


create table if not exists public."players" (
  "id" bigint default nextval('players_id_seq'::regclass) not null,
  "name" text not null,
  "rating" numeric,
  "created_at" timestamp without time zone default now(),
  "updated_at" timestamp without time zone default now(),
  "email" text,
  "position" text,
  "archived" boolean default false,
  "gender" text,
  "age_group" text,
  "indigeneity" text,
  "new_canadian" boolean default false,
  "join_date" date,
  "first_scrimmage_date" date,
  "last_scrimmage_date" date,
  "is_pillar" boolean default false,
  "rating_v2" numeric,
  "rating_v2_anchored" boolean default false,
  "lower_pillar_id" bigint,
  "upper_pillar_id" bigint,
  "rating_v2b" numeric,
  "class_id" bigint,
  constraint "players_age_group_check" CHECK ((age_group = ANY (ARRAY['≤21'::text, '22-34'::text, '35-54'::text, '55+'::text]))),
  constraint "players_gender_check" CHECK ((gender = ANY (ARRAY['Male'::text, 'Female'::text, 'Gender Diverse'::text, 'Not Specified'::text]))),
  constraint "players_indigeneity_check" CHECK ((indigeneity = ANY (ARRAY['First Nations'::text, 'Metis'::text, 'Inuit'::text, 'N'::text]))),
  constraint "players_name_key" UNIQUE (name),
  constraint "players_pkey" PRIMARY KEY (id),
  constraint "players_rating_check" CHECK (((rating >= (0)::numeric) AND (rating <= (20)::numeric)))
);

CREATE INDEX idx_players_email ON public.players USING btree (email);
CREATE INDEX idx_players_name ON public.players USING btree (name);

create table if not exists public."rating_nudges" (
  "id" bigint not null,
  "player_id" bigint not null,
  "skate_id" bigint,
  "direction" text not null,
  "source" text not null,
  "nudge_amount" numeric default 1,
  "created_at" timestamp with time zone default now(),
  constraint "rating_nudges_direction_check" CHECK ((direction = ANY (ARRAY['up'::text, 'down'::text]))),
  constraint "rating_nudges_pkey" PRIMARY KEY (id),
  constraint "rating_nudges_source_check" CHECK ((source = ANY (ARRAY['team_vote'::text, 'pillar_comparison'::text, 'manual'::text])))
);


create table if not exists public."registrants" (
  "id" bigint default nextval('registrants_id_seq'::regclass) not null,
  "league_id" bigint,
  "player_id" bigint,
  "name" text not null,
  "email" text,
  "position" text,
  "status" text default 'unpaid'::text,
  "registered_at" timestamp without time zone,
  "created_at" timestamp without time zone default now(),
  "approval_status" text default 'approved'::text,
  "payment_status" text default 'paid'::text,
  constraint "registrants_pkey" PRIMARY KEY (id)
);


create table if not exists public."rink_rates" (
  "id" bigint not null,
  "rink_group" text not null,
  "season" text not null,
  "day_type" text not null,
  "time_slot" text not null,
  "time_start" time without time zone not null,
  "time_end" time without time zone not null,
  "rate_per_hour" numeric not null,
  "notes" text,
  "created_at" timestamp with time zone default now(),
  constraint "rink_rates_day_type_check" CHECK ((day_type = ANY (ARRAY['weekday'::text, 'weekend'::text, 'all'::text]))),
  constraint "rink_rates_pkey" PRIMARY KEY (id),
  constraint "rink_rates_season_check" CHECK ((season = ANY (ARRAY['summer'::text, 'winter'::text, 'year_round'::text])))
);


create table if not exists public."seasons" (
  "id" bigint not null,
  "name" text not null,
  "created_at" timestamp with time zone default now(),
  constraint "seasons_pkey" PRIMARY KEY (id)
);


create table if not exists public."skate_registrations" (
  "id" bigint default nextval('skate_registrations_id_seq'::regclass) not null,
  "skate_id" bigint,
  "player_name" text not null,
  "is_goalie" boolean default false,
  "is_paid" boolean default true,
  "is_waitlist" boolean default false,
  "position" integer not null,
  "friend_group" text,
  "created_at" timestamp without time zone default now(),
  "updated_at" timestamp without time zone default now(),
  "player_id" integer,
  "player_name_legacy" text,
  constraint "skate_registrations_pkey" PRIMARY KEY (id)
);

CREATE INDEX idx_skate_registrations_skate_id ON public.skate_registrations USING btree (skate_id);

create table if not exists public."skate_teams" (
  "id" bigint not null,
  "skate_id" bigint,
  "dark_team" jsonb,
  "light_team" jsonb,
  "saved_at" timestamp with time zone default now(),
  constraint "skate_teams_pkey" PRIMARY KEY (id),
  constraint "skate_teams_skate_id_key" UNIQUE (skate_id)
);


create table if not exists public."skate_votes" (
  "id" bigint not null,
  "skate_id" bigint not null,
  "dark_votes" integer default 0,
  "light_votes" integer default 0,
  "last_updated" timestamp with time zone default now(),
  constraint "skate_votes_pkey" PRIMARY KEY (id),
  constraint "skate_votes_skate_id_key" UNIQUE (skate_id)
);


create table if not exists public."skates" (
  "id" bigint default nextval('skates_id_seq'::regclass) not null,
  "title" text not null,
  "date" date not null,
  "time_start" time without time zone not null,
  "time_end" time without time zone not null,
  "cost" text not null,
  "location" text not null,
  "capacity" integer default 24 not null,
  "tier" text,
  "created_at" timestamp without time zone default now(),
  "updated_at" timestamp without time zone default now(),
  "skate_number" text,
  "event_type" text default 'Scrimmage'::text,
  "ref" text,
  "ref_cost" numeric,
  "other_cost" numeric,
  "confidence" text default 'clean'::text,
  "ice_cost" numeric,
  "is_free" boolean default false,
  constraint "skates_confidence_check" CHECK ((confidence = ANY (ARRAY['clean'::text, 'messy'::text, 'chaotic'::text]))),
  constraint "skates_pkey" PRIMARY KEY (id)
);

CREATE INDEX idx_skates_date ON public.skates USING btree (date);

create table if not exists public."team_assignments" (
  "id" bigint not null,
  "class_id" bigint,
  "date_balanced" date,
  "team_names" text[],
  "created_at" timestamp with time zone default now(),
  constraint "team_assignments_pkey" PRIMARY KEY (id)
);


create table if not exists public."teams" (
  "id" bigint default nextval('teams_id_seq'::regclass) not null,
  "league_id" bigint,
  "name" text not null,
  "gm_name" text,
  "gm_email" text,
  "draft_order" integer,
  "created_at" timestamp without time zone default now(),
  "gm_code" text,
  constraint "teams_pkey" PRIMARY KEY (id)
);


create table if not exists public."v2b_ratings" (
  "id" bigint not null,
  "player_id" bigint,
  "rater" text not null,
  "skating" numeric,
  "puck_skills" numeric,
  "hockey_iq" numeric,
  "competitiveness" numeric,
  "game_readiness" numeric,
  "composite" numeric,
  "created_at" timestamp with time zone default now(),
  constraint "v2b_ratings_pkey" PRIMARY KEY (id)
);


create table if not exists public."wishlists" (
  "id" bigint not null,
  "team_id" bigint,
  "registrant_id" bigint,
  "slot" integer not null,
  "created_at" timestamp without time zone default now(),
  constraint "wishlists_pkey" PRIMARY KEY (id),
  constraint "wishlists_team_id_slot_key" UNIQUE (team_id, slot)
);



-- Add foreign keys after all referenced tables exist.
ALTER TABLE public."attendance" ADD constraint "attendance_player_id_fkey" FOREIGN KEY (player_id) REFERENCES players(id);
ALTER TABLE public."attendance" ADD constraint "attendance_skate_id_fkey" FOREIGN KEY (skate_id) REFERENCES skates(id);
ALTER TABLE public."classes" ADD constraint "classes_season_id_fkey" FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE;
ALTER TABLE public."draft_picks" ADD constraint "draft_picks_league_id_fkey" FOREIGN KEY (league_id) REFERENCES leagues(id);
ALTER TABLE public."draft_picks" ADD constraint "draft_picks_registrant_id_fkey" FOREIGN KEY (registrant_id) REFERENCES registrants(id);
ALTER TABLE public."draft_picks" ADD constraint "draft_picks_team_id_fkey" FOREIGN KEY (team_id) REFERENCES teams(id);
ALTER TABLE public."draft_sessions" ADD constraint "draft_sessions_league_id_fkey" FOREIGN KEY (league_id) REFERENCES leagues(id);
ALTER TABLE public."friend_group_members" ADD constraint "friend_group_members_friend_group_id_fkey" FOREIGN KEY (friend_group_id) REFERENCES friend_groups(id) ON DELETE CASCADE;
ALTER TABLE public."friend_group_members" ADD constraint "friend_group_members_player_id_fkey" FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;
ALTER TABLE public."friend_groups" ADD constraint "friend_groups_class_id_fkey" FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;
ALTER TABLE public."jersey_inventory" ADD constraint "jersey_inventory_class_id_fkey" FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;
ALTER TABLE public."player_credits" ADD constraint "player_credits_player_id_fkey" FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;
ALTER TABLE public."player_credits" ADD constraint "player_credits_source_skate_id_fkey" FOREIGN KEY (source_skate_id) REFERENCES skates(id) ON DELETE SET NULL;
ALTER TABLE public."player_credits" ADD constraint "player_credits_used_on_skate_id_fkey" FOREIGN KEY (used_on_skate_id) REFERENCES skates(id) ON DELETE SET NULL;
ALTER TABLE public."player_skills" ADD constraint "player_skills_player_id_fkey" FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;
ALTER TABLE public."player_skills_simple" ADD constraint "player_skills_simple_player_id_fkey" FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;
ALTER TABLE public."player_team_assignments" ADD constraint "player_team_assignments_player_id_fkey" FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;
ALTER TABLE public."player_team_assignments" ADD constraint "player_team_assignments_team_assignment_id_fkey" FOREIGN KEY (team_assignment_id) REFERENCES team_assignments(id) ON DELETE CASCADE;
ALTER TABLE public."players" ADD constraint "players_class_id_fkey" FOREIGN KEY (class_id) REFERENCES classes(id);
ALTER TABLE public."players" ADD constraint "players_lower_pillar_id_fkey" FOREIGN KEY (lower_pillar_id) REFERENCES players(id);
ALTER TABLE public."players" ADD constraint "players_upper_pillar_id_fkey" FOREIGN KEY (upper_pillar_id) REFERENCES players(id);
ALTER TABLE public."rating_nudges" ADD constraint "rating_nudges_player_id_fkey" FOREIGN KEY (player_id) REFERENCES players(id);
ALTER TABLE public."rating_nudges" ADD constraint "rating_nudges_skate_id_fkey" FOREIGN KEY (skate_id) REFERENCES skates(id);
ALTER TABLE public."registrants" ADD constraint "registrants_league_id_fkey" FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE;
ALTER TABLE public."registrants" ADD constraint "registrants_player_id_fkey" FOREIGN KEY (player_id) REFERENCES players(id);
ALTER TABLE public."skate_registrations" ADD constraint "skate_registrations_player_id_fkey" FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;
ALTER TABLE public."skate_registrations" ADD constraint "skate_registrations_skate_id_fkey" FOREIGN KEY (skate_id) REFERENCES skates(id) ON DELETE CASCADE;
ALTER TABLE public."skate_teams" ADD constraint "skate_teams_skate_id_fkey" FOREIGN KEY (skate_id) REFERENCES skates(id) ON DELETE CASCADE;
ALTER TABLE public."skate_votes" ADD constraint "skate_votes_skate_id_fkey" FOREIGN KEY (skate_id) REFERENCES skates(id);
ALTER TABLE public."team_assignments" ADD constraint "team_assignments_class_id_fkey" FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;
ALTER TABLE public."teams" ADD constraint "teams_league_id_fkey" FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE;
ALTER TABLE public."v2b_ratings" ADD constraint "v2b_ratings_player_id_fkey" FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;
ALTER TABLE public."wishlists" ADD constraint "wishlists_registrant_id_fkey" FOREIGN KEY (registrant_id) REFERENCES registrants(id);
ALTER TABLE public."wishlists" ADD constraint "wishlists_team_id_fkey" FOREIGN KEY (team_id) REFERENCES teams(id);

alter sequence public."draft_sessions_id_seq" owned by public."draft_sessions"."id";
alter sequence public."leagues_id_seq" owned by public."leagues"."id";
alter sequence public."player_credits_id_seq" owned by public."player_credits"."id";
alter sequence public."players_id_seq" owned by public."players"."id";
alter sequence public."registrants_id_seq" owned by public."registrants"."id";
alter sequence public."skate_registrations_id_seq" owned by public."skate_registrations"."id";
alter sequence public."skates_id_seq" owned by public."skates"."id";
alter sequence public."teams_id_seq" owned by public."teams"."id";

-- Fail closed in staging; authentication policies will be added with the app.
alter table public."attendance" enable row level security;
alter table public."classes" enable row level security;
alter table public."draft_picks" enable row level security;
alter table public."draft_sessions" enable row level security;
alter table public."friend_group_members" enable row level security;
alter table public."friend_groups" enable row level security;
alter table public."jersey_inventory" enable row level security;
alter table public."leagues" enable row level security;
alter table public."player_credits" enable row level security;
alter table public."player_skills" enable row level security;
alter table public."player_skills_simple" enable row level security;
alter table public."player_team_assignments" enable row level security;
alter table public."players" enable row level security;
alter table public."rating_nudges" enable row level security;
alter table public."registrants" enable row level security;
alter table public."rink_rates" enable row level security;
alter table public."seasons" enable row level security;
alter table public."skate_registrations" enable row level security;
alter table public."skate_teams" enable row level security;
alter table public."skate_votes" enable row level security;
alter table public."skates" enable row level security;
alter table public."team_assignments" enable row level security;
alter table public."teams" enable row level security;
alter table public."v2b_ratings" enable row level security;
alter table public."wishlists" enable row level security;

revoke all privileges on all tables in schema public from public, anon, authenticated;
revoke all privileges on all sequences in schema public from public, anon, authenticated;

commit;