-- ============================================
-- Nian Ji Supabase schema
-- ============================================

-- ============================================
-- Common updated_at trigger
-- ============================================

create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================
-- memories
-- ============================================

create table if not exists public.memories (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  audio_url text,
  audio_path text,
  audio_mime_type text,
  audio_size_bytes bigint,
  duration_ms integer,
  transcript text,
  transcript_segments jsonb default '[]'::jsonb not null,
  transcript_provider text,
  transcript_model text,
  transcript_status text default 'pending' not null,
  summary text default 'capturing...' not null,
  tags jsonb default '[]'::jsonb not null,
  reply_status text default 'pending' not null,
  profile_status text default 'pending' not null,
  last_error text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint memories_transcript_status_check check (transcript_status in ('pending', 'completed', 'failed')),
  constraint memories_reply_status_check check (reply_status in ('pending', 'completed', 'failed')),
  constraint memories_profile_status_check check (profile_status in ('pending', 'completed', 'failed'))
);

drop trigger if exists update_memories_updated_at on public.memories;
create trigger update_memories_updated_at
before update on public.memories
for each row
execute function public.update_updated_at_column();

create index if not exists idx_memories_user_id on public.memories(user_id);
create index if not exists idx_memories_created_at on public.memories(created_at desc);
create index if not exists idx_memories_tags on public.memories using gin(tags);
create index if not exists idx_memories_transcript_status on public.memories(transcript_status);
create index if not exists idx_memories_profile_status on public.memories(profile_status);

alter table public.memories enable row level security;

drop policy if exists "Users can view own memories" on public.memories;
create policy "Users can view own memories"
on public.memories for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own memories" on public.memories;
create policy "Users can insert own memories"
on public.memories for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own memories" on public.memories;
create policy "Users can update own memories"
on public.memories for update
using (auth.uid() = user_id);

drop policy if exists "Users can delete own memories" on public.memories;
create policy "Users can delete own memories"
on public.memories for delete
using (auth.uid() = user_id);

-- ============================================
-- semantic_memory_chunks
-- Raw semantic evidence substrate beneath confirmed assets
-- ============================================

create table if not exists public.semantic_memory_chunks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  memory_id uuid references public.memories(id) on delete cascade not null,
  chunk_index integer not null,
  source_kind text default 'raw_transcript' not null,
  chunk_text text not null,
  normalized_text text default '' not null,
  chunk_summary text default '' not null,
  tags jsonb default '[]'::jsonb not null,
  person_hints jsonb default '[]'::jsonb not null,
  place_hints jsonb default '[]'::jsonb not null,
  time_hints jsonb default '[]'::jsonb not null,
  transcript_created_at timestamp with time zone,
  event_time_start timestamp with time zone,
  event_time_end timestamp with time zone,
  source_fact_ids jsonb default '[]'::jsonb not null,
  source_event_ids jsonb default '[]'::jsonb not null,
  importance numeric(4,3) default 0.350 not null,
  confidence numeric(4,3) default 0.600 not null,
  is_high_value boolean default false not null,
  evidence_status text default 'active' not null,
  embedding_status text default 'skipped' not null,
  embedding_key text,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint semantic_memory_chunks_unique_memory_chunk unique (memory_id, chunk_index),
  constraint semantic_memory_chunks_source_kind_check check (
    source_kind in ('raw_transcript', 'confirmed_fact', 'confirmed_event')
  ),
  constraint semantic_memory_chunks_importance_check check (importance >= 0 and importance <= 1),
  constraint semantic_memory_chunks_confidence_check check (confidence >= 0 and confidence <= 1),
  constraint semantic_memory_chunks_evidence_status_check check (evidence_status in ('active', 'archived')),
  constraint semantic_memory_chunks_embedding_status_check check (
    embedding_status in ('pending', 'ready', 'failed', 'skipped')
  )
);

drop trigger if exists update_semantic_memory_chunks_updated_at on public.semantic_memory_chunks;
create trigger update_semantic_memory_chunks_updated_at
before update on public.semantic_memory_chunks
for each row
execute function public.update_updated_at_column();

create index if not exists idx_semantic_memory_chunks_user_id on public.semantic_memory_chunks(user_id);
create index if not exists idx_semantic_memory_chunks_memory_id on public.semantic_memory_chunks(memory_id);
create index if not exists idx_semantic_memory_chunks_high_value
on public.semantic_memory_chunks(user_id, is_high_value desc, updated_at desc);
create index if not exists idx_semantic_memory_chunks_tags on public.semantic_memory_chunks using gin(tags);
create index if not exists idx_semantic_memory_chunks_person_hints on public.semantic_memory_chunks using gin(person_hints);
create index if not exists idx_semantic_memory_chunks_place_hints on public.semantic_memory_chunks using gin(place_hints);
create index if not exists idx_semantic_memory_chunks_time_hints on public.semantic_memory_chunks using gin(time_hints);
create index if not exists idx_semantic_memory_chunks_source_fact_ids on public.semantic_memory_chunks using gin(source_fact_ids);
create index if not exists idx_semantic_memory_chunks_source_event_ids on public.semantic_memory_chunks using gin(source_event_ids);

alter table public.semantic_memory_chunks enable row level security;

drop policy if exists "Users can view own semantic memory chunks" on public.semantic_memory_chunks;
create policy "Users can view own semantic memory chunks"
on public.semantic_memory_chunks for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own semantic memory chunks" on public.semantic_memory_chunks;
create policy "Users can insert own semantic memory chunks"
on public.semantic_memory_chunks for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own semantic memory chunks" on public.semantic_memory_chunks;
create policy "Users can update own semantic memory chunks"
on public.semantic_memory_chunks for update
using (auth.uid() = user_id);

drop policy if exists "Users can delete own semantic memory chunks" on public.semantic_memory_chunks;
create policy "Users can delete own semantic memory chunks"
on public.semantic_memory_chunks for delete
using (auth.uid() = user_id);

-- ============================================
-- companion_profile_traits
-- Candidate/vetted traits that feed clean companion profile projection
-- ============================================

create table if not exists public.companion_profile_traits (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  trait_type text not null,
  normalized_key text not null,
  display_text text default '' not null,
  support_count integer default 0 not null,
  trust_score numeric(6,3) default 0 not null,
  status text default 'candidate' not null,
  source_memory_ids jsonb default '[]'::jsonb not null,
  metadata jsonb default '{}'::jsonb not null,
  first_seen_at timestamp with time zone default now() not null,
  last_seen_at timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint companion_profile_traits_unique_key unique (user_id, trait_type, normalized_key),
  constraint companion_profile_traits_status_check check (status in ('candidate', 'vetted', 'rejected', 'stale')),
  constraint companion_profile_traits_support_count_check check (support_count >= 0),
  constraint companion_profile_traits_trust_score_check check (trust_score >= 0)
);

drop trigger if exists update_companion_profile_traits_updated_at on public.companion_profile_traits;
create trigger update_companion_profile_traits_updated_at
before update on public.companion_profile_traits
for each row
execute function public.update_updated_at_column();

create index if not exists idx_companion_profile_traits_user_id on public.companion_profile_traits(user_id);
create index if not exists idx_companion_profile_traits_status on public.companion_profile_traits(status);
create index if not exists idx_companion_profile_traits_last_seen_at on public.companion_profile_traits(last_seen_at desc);
create index if not exists idx_companion_profile_traits_updated_at on public.companion_profile_traits(updated_at desc);
create index if not exists idx_companion_profile_traits_source_memory_ids
on public.companion_profile_traits using gin(source_memory_ids);

alter table public.companion_profile_traits enable row level security;

drop policy if exists "Users can view own companion profile traits" on public.companion_profile_traits;
create policy "Users can view own companion profile traits"
on public.companion_profile_traits for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own companion profile traits" on public.companion_profile_traits;
create policy "Users can insert own companion profile traits"
on public.companion_profile_traits for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own companion profile traits" on public.companion_profile_traits;
create policy "Users can update own companion profile traits"
on public.companion_profile_traits for update
using (auth.uid() = user_id);

drop policy if exists "Users can delete own companion profile traits" on public.companion_profile_traits;
create policy "Users can delete own companion profile traits"
on public.companion_profile_traits for delete
using (auth.uid() = user_id);

-- ============================================
-- companion_profiles
-- ============================================

create table if not exists public.companion_profiles (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null unique,
  version integer default 1 not null,
  sessions integer default 0 not null,
  style_summary text default '' not null,
  catchphrases jsonb default '[]'::jsonb not null,
  lexical_habits jsonb default '[]'::jsonb not null,
  emotional_markers jsonb default '[]'::jsonb not null,
  storytelling_patterns jsonb default '[]'::jsonb not null,
  relationship_mentions jsonb default '[]'::jsonb not null,
  memory_themes jsonb default '[]'::jsonb not null,
  life_facts jsonb default '[]'::jsonb not null,
  pacing text default '' not null,
  pauses text default '' not null,
  twin_notes text default '' not null,
  last_transcript text default '' not null,
  source_memory_id uuid references public.memories(id) on delete set null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

drop trigger if exists update_companion_profiles_updated_at on public.companion_profiles;
create trigger update_companion_profiles_updated_at
before update on public.companion_profiles
for each row
execute function public.update_updated_at_column();

create index if not exists idx_companion_profiles_user_id on public.companion_profiles(user_id);
create index if not exists idx_companion_profiles_updated_at on public.companion_profiles(updated_at desc);
create index if not exists idx_companion_profiles_memory_themes on public.companion_profiles using gin(memory_themes);

alter table public.companion_profiles enable row level security;

drop policy if exists "Users can view own companion profile" on public.companion_profiles;
create policy "Users can view own companion profile"
on public.companion_profiles for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own companion profile" on public.companion_profiles;
create policy "Users can insert own companion profile"
on public.companion_profiles for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own companion profile" on public.companion_profiles;
create policy "Users can update own companion profile"
on public.companion_profiles for update
using (auth.uid() = user_id);

drop policy if exists "Users can delete own companion profile" on public.companion_profiles;
create policy "Users can delete own companion profile"
on public.companion_profiles for delete
using (auth.uid() = user_id);

-- ============================================
-- memory_facts
-- Non-event memory layer for facts, preferences, fears, beliefs, locations
-- ============================================

create table if not exists public.memory_facts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  canonical_key text,
  fact_type text not null,
  subject text not null,
  predicate text not null,
  object_text text default '' not null,
  value_json jsonb default '{}'::jsonb not null,
  valid_time_type text default 'unknown' not null,
  start_at timestamp with time zone,
  end_at timestamp with time zone,
  confidence numeric(4,3) default 0.500 not null,
  source_memory_ids jsonb default '[]'::jsonb not null,
  supersedes_fact_id uuid references public.memory_facts(id) on delete set null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint memory_facts_confidence_check check (confidence >= 0 and confidence <= 1),
  constraint memory_facts_valid_time_type_check check (valid_time_type in ('current', 'long_term', 'past', 'temporary', 'unknown'))
);

drop trigger if exists update_memory_facts_updated_at on public.memory_facts;
create trigger update_memory_facts_updated_at
before update on public.memory_facts
for each row
execute function public.update_updated_at_column();

create index if not exists idx_memory_facts_user_id on public.memory_facts(user_id);
create index if not exists idx_memory_facts_fact_type on public.memory_facts(fact_type);
create index if not exists idx_memory_facts_subject on public.memory_facts(subject);
create index if not exists idx_memory_facts_canonical_key on public.memory_facts(canonical_key);
create index if not exists idx_memory_facts_source_memory_ids on public.memory_facts using gin(source_memory_ids);
create index if not exists idx_memory_facts_value_json on public.memory_facts using gin(value_json);
create unique index if not exists idx_memory_facts_user_canonical_key
on public.memory_facts(user_id, canonical_key)
where canonical_key is not null;

alter table public.memory_facts enable row level security;

drop policy if exists "Users can view own memory facts" on public.memory_facts;
create policy "Users can view own memory facts"
on public.memory_facts for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own memory facts" on public.memory_facts;
create policy "Users can insert own memory facts"
on public.memory_facts for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own memory facts" on public.memory_facts;
create policy "Users can update own memory facts"
on public.memory_facts for update
using (auth.uid() = user_id);

drop policy if exists "Users can delete own memory facts" on public.memory_facts;
create policy "Users can delete own memory facts"
on public.memory_facts for delete
using (auth.uid() = user_id);

-- ============================================
-- memory_events
-- Timeline-ready user life events
-- ============================================

create table if not exists public.memory_events (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  canonical_key text,
  title text not null,
  description text default '' not null,
  time_type text default 'unknown' not null,
  start_at timestamp with time zone,
  end_at timestamp with time zone,
  year integer,
  age_at_event integer,
  life_stage text,
  is_current boolean default false not null,
  location_name text,
  emotion text,
  importance smallint default 3 not null,
  confidence numeric(4,3) default 0.500 not null,
  source_memory_ids jsonb default '[]'::jsonb not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint memory_events_time_type_check check (time_type in ('exact', 'year', 'age', 'relative', 'current', 'unknown')),
  constraint memory_events_importance_check check (importance between 1 and 5),
  constraint memory_events_confidence_check check (confidence >= 0 and confidence <= 1)
);

drop trigger if exists update_memory_events_updated_at on public.memory_events;
create trigger update_memory_events_updated_at
before update on public.memory_events
for each row
execute function public.update_updated_at_column();

create index if not exists idx_memory_events_user_id on public.memory_events(user_id);
create index if not exists idx_memory_events_start_at on public.memory_events(start_at desc);
create index if not exists idx_memory_events_year on public.memory_events(year);
create index if not exists idx_memory_events_life_stage on public.memory_events(life_stage);
create index if not exists idx_memory_events_current on public.memory_events(is_current);
create index if not exists idx_memory_events_source_memory_ids on public.memory_events using gin(source_memory_ids);
create unique index if not exists idx_memory_events_user_canonical_key
on public.memory_events(user_id, canonical_key)
where canonical_key is not null;

alter table public.memory_events enable row level security;

drop policy if exists "Users can view own memory events" on public.memory_events;
create policy "Users can view own memory events"
on public.memory_events for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own memory events" on public.memory_events;
create policy "Users can insert own memory events"
on public.memory_events for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own memory events" on public.memory_events;
create policy "Users can update own memory events"
on public.memory_events for update
using (auth.uid() = user_id);

drop policy if exists "Users can delete own memory events" on public.memory_events;
create policy "Users can delete own memory events"
on public.memory_events for delete
using (auth.uid() = user_id);

-- ============================================
-- people
-- Person entities extracted from memories
-- ============================================

create table if not exists public.people (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  canonical_name text not null,
  display_name text not null,
  aliases jsonb default '[]'::jsonb not null,
  gender text,
  notes text default '' not null,
  confidence numeric(4,3) default 0.500 not null,
  source_memory_ids jsonb default '[]'::jsonb not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint people_confidence_check check (confidence >= 0 and confidence <= 1)
);

drop trigger if exists update_people_updated_at on public.people;
create trigger update_people_updated_at
before update on public.people
for each row
execute function public.update_updated_at_column();

create index if not exists idx_people_user_id on public.people(user_id);
create index if not exists idx_people_display_name on public.people(display_name);
create index if not exists idx_people_aliases on public.people using gin(aliases);
create index if not exists idx_people_source_memory_ids on public.people using gin(source_memory_ids);
create unique index if not exists idx_people_user_canonical_name on public.people(user_id, canonical_name);

alter table public.people enable row level security;

drop policy if exists "Users can view own people" on public.people;
create policy "Users can view own people"
on public.people for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own people" on public.people;
create policy "Users can insert own people"
on public.people for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own people" on public.people;
create policy "Users can update own people"
on public.people for update
using (auth.uid() = user_id);

drop policy if exists "Users can delete own people" on public.people;
create policy "Users can delete own people"
on public.people for delete
using (auth.uid() = user_id);

-- ============================================
-- person_relationships
-- User-to-person relationship graph
-- ============================================

create table if not exists public.person_relationships (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  person_id uuid references public.people(id) on delete cascade not null,
  relation_type text not null,
  relation_label text,
  closeness smallint default 3 not null,
  sentiment text,
  status text default 'active' not null,
  start_at timestamp with time zone,
  end_at timestamp with time zone,
  confidence numeric(4,3) default 0.500 not null,
  source_memory_ids jsonb default '[]'::jsonb not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint person_relationships_closeness_check check (closeness between 1 and 5),
  constraint person_relationships_confidence_check check (confidence >= 0 and confidence <= 1),
  constraint person_relationships_status_check check (status in ('active', 'past', 'unclear'))
);

drop trigger if exists update_person_relationships_updated_at on public.person_relationships;
create trigger update_person_relationships_updated_at
before update on public.person_relationships
for each row
execute function public.update_updated_at_column();

create index if not exists idx_person_relationships_user_id on public.person_relationships(user_id);
create index if not exists idx_person_relationships_person_id on public.person_relationships(person_id);
create index if not exists idx_person_relationships_type on public.person_relationships(relation_type);
create index if not exists idx_person_relationships_status on public.person_relationships(status);
create index if not exists idx_person_relationships_source_memory_ids on public.person_relationships using gin(source_memory_ids);

alter table public.person_relationships enable row level security;

drop policy if exists "Users can view own relationships" on public.person_relationships;
create policy "Users can view own relationships"
on public.person_relationships for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own relationships" on public.person_relationships;
create policy "Users can insert own relationships"
on public.person_relationships for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own relationships" on public.person_relationships;
create policy "Users can update own relationships"
on public.person_relationships for update
using (auth.uid() = user_id);

drop policy if exists "Users can delete own relationships" on public.person_relationships;
create policy "Users can delete own relationships"
on public.person_relationships for delete
using (auth.uid() = user_id);

-- ============================================
-- memory_event_links
-- Join table between raw memories and extracted events
-- ============================================

create table if not exists public.memory_event_links (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  memory_id uuid references public.memories(id) on delete cascade not null,
  event_id uuid references public.memory_events(id) on delete cascade not null,
  relevance numeric(4,3) default 0.700 not null,
  created_at timestamp with time zone default now() not null,
  constraint memory_event_links_relevance_check check (relevance >= 0 and relevance <= 1)
);

create unique index if not exists idx_memory_event_links_unique on public.memory_event_links(memory_id, event_id);
create index if not exists idx_memory_event_links_user_id on public.memory_event_links(user_id);
create index if not exists idx_memory_event_links_memory_id on public.memory_event_links(memory_id);
create index if not exists idx_memory_event_links_event_id on public.memory_event_links(event_id);

alter table public.memory_event_links enable row level security;

drop policy if exists "Users can view own memory event links" on public.memory_event_links;
create policy "Users can view own memory event links"
on public.memory_event_links for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own memory event links" on public.memory_event_links;
create policy "Users can insert own memory event links"
on public.memory_event_links for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own memory event links" on public.memory_event_links;
create policy "Users can update own memory event links"
on public.memory_event_links for update
using (auth.uid() = user_id);

drop policy if exists "Users can delete own memory event links" on public.memory_event_links;
create policy "Users can delete own memory event links"
on public.memory_event_links for delete
using (auth.uid() = user_id);

-- ============================================
-- memory_person_links
-- Join table between raw memories and extracted people
-- ============================================

create table if not exists public.memory_person_links (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  memory_id uuid references public.memories(id) on delete cascade not null,
  person_id uuid references public.people(id) on delete cascade not null,
  mention_role text,
  relevance numeric(4,3) default 0.700 not null,
  created_at timestamp with time zone default now() not null,
  constraint memory_person_links_relevance_check check (relevance >= 0 and relevance <= 1)
);

create unique index if not exists idx_memory_person_links_unique on public.memory_person_links(memory_id, person_id);
create index if not exists idx_memory_person_links_user_id on public.memory_person_links(user_id);
create index if not exists idx_memory_person_links_memory_id on public.memory_person_links(memory_id);
create index if not exists idx_memory_person_links_person_id on public.memory_person_links(person_id);

alter table public.memory_person_links enable row level security;

drop policy if exists "Users can view own memory person links" on public.memory_person_links;
create policy "Users can view own memory person links"
on public.memory_person_links for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own memory person links" on public.memory_person_links;
create policy "Users can insert own memory person links"
on public.memory_person_links for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own memory person links" on public.memory_person_links;
create policy "Users can update own memory person links"
on public.memory_person_links for update
using (auth.uid() = user_id);

drop policy if exists "Users can delete own memory person links" on public.memory_person_links;
create policy "Users can delete own memory person links"
on public.memory_person_links for delete
using (auth.uid() = user_id);

-- ============================================
-- memory_speech_features
-- Per-recording speech habits and prosody features
-- ============================================

create table if not exists public.memory_speech_features (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  memory_id uuid references public.memories(id) on delete cascade not null unique,
  speaking_rate_wpm numeric(8,2),
  avg_pause_ms numeric(8,2),
  longest_pause_ms numeric(8,2),
  pause_count integer,
  filler_words jsonb default '[]'::jsonb not null,
  filler_word_count integer,
  sentence_length_avg numeric(8,2),
  energy_label text,
  prosody_notes text default '' not null,
  confidence numeric(4,3) default 0.500 not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint memory_speech_features_confidence_check check (confidence >= 0 and confidence <= 1)
);

drop trigger if exists update_memory_speech_features_updated_at on public.memory_speech_features;
create trigger update_memory_speech_features_updated_at
before update on public.memory_speech_features
for each row
execute function public.update_updated_at_column();

create index if not exists idx_memory_speech_features_user_id on public.memory_speech_features(user_id);
create index if not exists idx_memory_speech_features_memory_id on public.memory_speech_features(memory_id);
create index if not exists idx_memory_speech_features_filler_words on public.memory_speech_features using gin(filler_words);

alter table public.memory_speech_features enable row level security;

drop policy if exists "Users can view own memory speech features" on public.memory_speech_features;
create policy "Users can view own memory speech features"
on public.memory_speech_features for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own memory speech features" on public.memory_speech_features;
create policy "Users can insert own memory speech features"
on public.memory_speech_features for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own memory speech features" on public.memory_speech_features;
create policy "Users can update own memory speech features"
on public.memory_speech_features for update
using (auth.uid() = user_id);

drop policy if exists "Users can delete own memory speech features" on public.memory_speech_features;
create policy "Users can delete own memory speech features"
on public.memory_speech_features for delete
using (auth.uid() = user_id);

-- ============================================
-- twin_profiles
-- Active twin configuration for a user
-- ============================================

create table if not exists public.twin_profiles (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  status text default 'draft' not null,
  origin_type text default 'bootstrap' not null,
  persona_summary text default '' not null,
  voice_style_summary text default '' not null,
  response_style text default '' not null,
  core_values jsonb default '[]'::jsonb not null,
  boundary_rules jsonb default '[]'::jsonb not null,
  seed_confidence numeric(4,3) default 0.500 not null,
  memory_readiness_score smallint default 0 not null,
  style_readiness_score smallint default 0 not null,
  share_enabled boolean default false not null,
  portrait_path text default '' not null,
  portrait_url text default '' not null,
  active_version_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint twin_profiles_status_check check (status in ('draft', 'seeded', 'active', 'shared')),
  constraint twin_profiles_origin_type_check check (origin_type in ('bootstrap', 'organic', 'mixed')),
  constraint twin_profiles_seed_confidence_check check (seed_confidence >= 0 and seed_confidence <= 1),
  constraint twin_profiles_memory_readiness_score_check check (memory_readiness_score between 0 and 100),
  constraint twin_profiles_style_readiness_score_check check (style_readiness_score between 0 and 100)
);

drop trigger if exists update_twin_profiles_updated_at on public.twin_profiles;
create trigger update_twin_profiles_updated_at
before update on public.twin_profiles
for each row
execute function public.update_updated_at_column();

create index if not exists idx_twin_profiles_user_id on public.twin_profiles(user_id);
create unique index if not exists idx_twin_profiles_user_unique on public.twin_profiles(user_id);
create index if not exists idx_twin_profiles_status on public.twin_profiles(status);
create index if not exists idx_twin_profiles_updated_at on public.twin_profiles(updated_at desc);

alter table public.twin_profiles enable row level security;

drop policy if exists "Users can view own twin profiles" on public.twin_profiles;
create policy "Users can view own twin profiles"
on public.twin_profiles for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own twin profiles" on public.twin_profiles;
create policy "Users can insert own twin profiles"
on public.twin_profiles for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own twin profiles" on public.twin_profiles;
create policy "Users can update own twin profiles"
on public.twin_profiles for update
using (auth.uid() = user_id);

drop policy if exists "Users can delete own twin profiles" on public.twin_profiles;
create policy "Users can delete own twin profiles"
on public.twin_profiles for delete
using (auth.uid() = user_id);

-- ============================================
-- twin_dialogue_grants
-- Explicit dialogue authorization for shared twins
-- ============================================

create table if not exists public.twin_dialogue_grants (
  id uuid default gen_random_uuid() primary key,
  twin_id uuid references public.twin_profiles(id) on delete cascade not null,
  owner_user_id uuid references auth.users(id) on delete cascade not null,
  grantee_user_id uuid references auth.users(id) on delete cascade not null,
  display_label text default '' not null,
  status text default 'active' not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint twin_dialogue_grants_status_check check (status in ('active', 'revoked')),
  constraint twin_dialogue_grants_not_self_check check (owner_user_id <> grantee_user_id)
);

drop trigger if exists update_twin_dialogue_grants_updated_at on public.twin_dialogue_grants;
create trigger update_twin_dialogue_grants_updated_at
before update on public.twin_dialogue_grants
for each row
execute function public.update_updated_at_column();

create unique index if not exists idx_twin_dialogue_grants_unique
on public.twin_dialogue_grants(twin_id, grantee_user_id);
create index if not exists idx_twin_dialogue_grants_owner
on public.twin_dialogue_grants(owner_user_id);
create index if not exists idx_twin_dialogue_grants_grantee
on public.twin_dialogue_grants(grantee_user_id);

alter table public.twin_dialogue_grants enable row level security;

drop policy if exists "Owners can view their twin dialogue grants" on public.twin_dialogue_grants;
create policy "Owners can view their twin dialogue grants"
on public.twin_dialogue_grants for select
using (auth.uid() = owner_user_id);

drop policy if exists "Grantees can view active twin dialogue grants" on public.twin_dialogue_grants;
create policy "Grantees can view active twin dialogue grants"
on public.twin_dialogue_grants for select
using (
  auth.uid() = grantee_user_id
  and status = 'active'
);

drop policy if exists "Owners can insert twin dialogue grants" on public.twin_dialogue_grants;
create policy "Owners can insert twin dialogue grants"
on public.twin_dialogue_grants for insert
with check (
  auth.uid() = owner_user_id
  and exists (
    select 1
    from public.twin_profiles
    where public.twin_profiles.id = twin_dialogue_grants.twin_id
      and public.twin_profiles.user_id = auth.uid()
  )
);

drop policy if exists "Owners can update twin dialogue grants" on public.twin_dialogue_grants;
create policy "Owners can update twin dialogue grants"
on public.twin_dialogue_grants for update
using (auth.uid() = owner_user_id);

drop policy if exists "Owners can delete twin dialogue grants" on public.twin_dialogue_grants;
create policy "Owners can delete twin dialogue grants"
on public.twin_dialogue_grants for delete
using (auth.uid() = owner_user_id);

drop policy if exists "Users can view own twin profiles" on public.twin_profiles;
create policy "Users can view own twin profiles"
on public.twin_profiles for select
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.twin_dialogue_grants
    where public.twin_dialogue_grants.twin_id = twin_profiles.id
      and public.twin_dialogue_grants.grantee_user_id = auth.uid()
      and public.twin_dialogue_grants.status = 'active'
  )
);

-- ============================================
-- twin_versions
-- Snapshot versions for a twin
-- ============================================

create table if not exists public.twin_versions (
  id uuid default gen_random_uuid() primary key,
  twin_id uuid references public.twin_profiles(id) on delete cascade not null,
  version_no integer not null,
  change_source text default 'bootstrap' not null,
  persona_snapshot jsonb default '{}'::jsonb not null,
  facts_snapshot jsonb default '[]'::jsonb not null,
  events_snapshot jsonb default '[]'::jsonb not null,
  people_snapshot jsonb default '[]'::jsonb not null,
  prompt_snapshot text default '' not null,
  created_at timestamp with time zone default now() not null,
  constraint twin_versions_change_source_check check (change_source in ('bootstrap', 'user_edit', 'memory_growth', 'rebuild'))
);

create unique index if not exists idx_twin_versions_unique on public.twin_versions(twin_id, version_no);
create index if not exists idx_twin_versions_twin_id on public.twin_versions(twin_id);
create index if not exists idx_twin_versions_created_at on public.twin_versions(created_at desc);

alter table public.twin_versions enable row level security;

drop policy if exists "Users can view own twin versions" on public.twin_versions;
create policy "Users can view own twin versions"
on public.twin_versions for select
using (
  exists (
    select 1
    from public.twin_profiles
    where public.twin_profiles.id = twin_versions.twin_id
      and (
        public.twin_profiles.user_id = auth.uid()
        or exists (
          select 1
          from public.twin_dialogue_grants
          where public.twin_dialogue_grants.twin_id = twin_versions.twin_id
            and public.twin_dialogue_grants.grantee_user_id = auth.uid()
            and public.twin_dialogue_grants.status = 'active'
        )
      )
  )
);

drop policy if exists "Users can insert own twin versions" on public.twin_versions;
create policy "Users can insert own twin versions"
on public.twin_versions for insert
with check (
  exists (
    select 1
    from public.twin_profiles
    where public.twin_profiles.id = twin_versions.twin_id
      and public.twin_profiles.user_id = auth.uid()
  )
);

drop policy if exists "Users can update own twin versions" on public.twin_versions;
create policy "Users can update own twin versions"
on public.twin_versions for update
using (
  exists (
    select 1
    from public.twin_profiles
    where public.twin_profiles.id = twin_versions.twin_id
      and public.twin_profiles.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete own twin versions" on public.twin_versions;
create policy "Users can delete own twin versions"
on public.twin_versions for delete
using (
  exists (
    select 1
    from public.twin_profiles
    where public.twin_profiles.id = twin_versions.twin_id
      and public.twin_profiles.user_id = auth.uid()
  )
);

-- ============================================
-- twin_topic_interactions
-- Lightweight per-asker topic memory for conversational progression
-- ============================================

create table if not exists public.twin_topic_interactions (
  id uuid default gen_random_uuid() primary key,
  twin_id uuid references public.twin_profiles(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  asker_key text not null,
  topic_key text not null,
  discuss_count integer default 1 not null,
  last_discussed_at timestamp with time zone default now() not null,
  last_answer_summary text default '' not null,
  last_answer_angle text default '' not null,
  last_answer_mode text default 'fresh_answer' not null,
  last_response_excerpt text default '' not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint twin_topic_interactions_discuss_count_check check (discuss_count >= 0),
  constraint twin_topic_interactions_answer_mode_check check (
    last_answer_mode in ('fresh_answer', 'deepen_answer', 'diversify_answer', 'graceful_close', 'fuzzy_recall')
  ),
  constraint twin_topic_interactions_unique_scope unique (twin_id, asker_key, topic_key)
);

drop trigger if exists update_twin_topic_interactions_updated_at on public.twin_topic_interactions;
create trigger update_twin_topic_interactions_updated_at
before update on public.twin_topic_interactions
for each row
execute function public.update_updated_at_column();

create index if not exists idx_twin_topic_interactions_twin_id on public.twin_topic_interactions(twin_id);
create index if not exists idx_twin_topic_interactions_user_id on public.twin_topic_interactions(user_id);
create index if not exists idx_twin_topic_interactions_asker_key on public.twin_topic_interactions(asker_key);
create index if not exists idx_twin_topic_interactions_last_discussed_at
on public.twin_topic_interactions(last_discussed_at desc);

alter table public.twin_topic_interactions enable row level security;

drop policy if exists "Users can view own twin topic interactions" on public.twin_topic_interactions;
create policy "Users can view own twin topic interactions"
on public.twin_topic_interactions for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own twin topic interactions" on public.twin_topic_interactions;
create policy "Users can insert own twin topic interactions"
on public.twin_topic_interactions for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own twin topic interactions" on public.twin_topic_interactions;
create policy "Users can update own twin topic interactions"
on public.twin_topic_interactions for update
using (auth.uid() = user_id);

drop policy if exists "Users can delete own twin topic interactions" on public.twin_topic_interactions;
create policy "Users can delete own twin topic interactions"
on public.twin_topic_interactions for delete
using (auth.uid() = user_id);

-- ============================================
-- twin_bootstrap_sessions
-- Voice interview sessions for quick twin generation
-- ============================================

create table if not exists public.twin_bootstrap_sessions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  twin_id uuid references public.twin_profiles(id) on delete set null,
  status text default 'in_progress' not null,
  stage_index integer default 0 not null,
  question_index integer default 0 not null,
  question_count integer default 12 not null,
  answers_count integer default 0 not null,
  summary text default '' not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  completed_at timestamp with time zone,
  constraint twin_bootstrap_sessions_status_check check (status in ('in_progress', 'completed', 'abandoned')),
  constraint twin_bootstrap_sessions_stage_index_check check (stage_index >= 0),
  constraint twin_bootstrap_sessions_question_index_check check (question_index >= 0),
  constraint twin_bootstrap_sessions_question_count_check check (question_count >= 1),
  constraint twin_bootstrap_sessions_answers_count_check check (answers_count >= 0)
);

drop trigger if exists update_twin_bootstrap_sessions_updated_at on public.twin_bootstrap_sessions;
create trigger update_twin_bootstrap_sessions_updated_at
before update on public.twin_bootstrap_sessions
for each row
execute function public.update_updated_at_column();

create index if not exists idx_twin_bootstrap_sessions_user_id on public.twin_bootstrap_sessions(user_id);
create index if not exists idx_twin_bootstrap_sessions_twin_id on public.twin_bootstrap_sessions(twin_id);
create index if not exists idx_twin_bootstrap_sessions_status on public.twin_bootstrap_sessions(status);
create index if not exists idx_twin_bootstrap_sessions_updated_at on public.twin_bootstrap_sessions(updated_at desc);

alter table public.twin_bootstrap_sessions enable row level security;

drop policy if exists "Users can view own twin bootstrap sessions" on public.twin_bootstrap_sessions;
create policy "Users can view own twin bootstrap sessions"
on public.twin_bootstrap_sessions for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own twin bootstrap sessions" on public.twin_bootstrap_sessions;
create policy "Users can insert own twin bootstrap sessions"
on public.twin_bootstrap_sessions for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own twin bootstrap sessions" on public.twin_bootstrap_sessions;
create policy "Users can update own twin bootstrap sessions"
on public.twin_bootstrap_sessions for update
using (auth.uid() = user_id);

drop policy if exists "Users can delete own twin bootstrap sessions" on public.twin_bootstrap_sessions;
create policy "Users can delete own twin bootstrap sessions"
on public.twin_bootstrap_sessions for delete
using (auth.uid() = user_id);

-- ============================================
-- twin_bootstrap_answers
-- Per-question answers collected during quick twin bootstrap
-- ============================================

create table if not exists public.twin_bootstrap_answers (
  id uuid default gen_random_uuid() primary key,
  session_id uuid references public.twin_bootstrap_sessions(id) on delete cascade not null,
  twin_id uuid references public.twin_profiles(id) on delete set null,
  user_id uuid references auth.users(id) on delete cascade not null,
  question_code text not null,
  question_text text not null,
  memory_id uuid references public.memories(id) on delete set null,
  transcript text default '' not null,
  extracted_facts jsonb default '[]'::jsonb not null,
  extracted_events jsonb default '[]'::jsonb not null,
  extracted_profile_delta jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

drop trigger if exists update_twin_bootstrap_answers_updated_at on public.twin_bootstrap_answers;
create trigger update_twin_bootstrap_answers_updated_at
before update on public.twin_bootstrap_answers
for each row
execute function public.update_updated_at_column();

create index if not exists idx_twin_bootstrap_answers_session_id on public.twin_bootstrap_answers(session_id);
create index if not exists idx_twin_bootstrap_answers_twin_id on public.twin_bootstrap_answers(twin_id);
create index if not exists idx_twin_bootstrap_answers_user_id on public.twin_bootstrap_answers(user_id);
create index if not exists idx_twin_bootstrap_answers_question_code on public.twin_bootstrap_answers(question_code);
create index if not exists idx_twin_bootstrap_answers_memory_id on public.twin_bootstrap_answers(memory_id);

alter table public.twin_bootstrap_answers enable row level security;

drop policy if exists "Users can view own twin bootstrap answers" on public.twin_bootstrap_answers;
create policy "Users can view own twin bootstrap answers"
on public.twin_bootstrap_answers for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own twin bootstrap answers" on public.twin_bootstrap_answers;
create policy "Users can insert own twin bootstrap answers"
on public.twin_bootstrap_answers for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own twin bootstrap answers" on public.twin_bootstrap_answers;
create policy "Users can update own twin bootstrap answers"
on public.twin_bootstrap_answers for update
using (auth.uid() = user_id);

drop policy if exists "Users can delete own twin bootstrap answers" on public.twin_bootstrap_answers;
create policy "Users can delete own twin bootstrap answers"
on public.twin_bootstrap_answers for delete
using (auth.uid() = user_id);

-- ============================================
-- Grants
-- ============================================

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.memories to anon, authenticated;
grant select, insert, update, delete on table public.semantic_memory_chunks to anon, authenticated;
grant select, insert, update, delete on table public.companion_profile_traits to anon, authenticated;
grant select, insert, update, delete on table public.companion_profiles to anon, authenticated;
grant select, insert, update, delete on table public.memory_facts to anon, authenticated;
grant select, insert, update, delete on table public.memory_events to anon, authenticated;
grant select, insert, update, delete on table public.people to anon, authenticated;
grant select, insert, update, delete on table public.person_relationships to anon, authenticated;
grant select, insert, update, delete on table public.memory_event_links to anon, authenticated;
grant select, insert, update, delete on table public.memory_person_links to anon, authenticated;
grant select, insert, update, delete on table public.memory_speech_features to anon, authenticated;
grant select, insert, update, delete on table public.twin_profiles to anon, authenticated;
grant select, insert, update, delete on table public.twin_dialogue_grants to anon, authenticated;
grant select, insert, update, delete on table public.twin_versions to anon, authenticated;
grant select, insert, update, delete on table public.twin_topic_interactions to anon, authenticated;
grant select, insert, update, delete on table public.twin_bootstrap_sessions to anon, authenticated;
grant select, insert, update, delete on table public.twin_bootstrap_answers to anon, authenticated;

-- ============================================
-- Storage bucket: recordings
-- ============================================

insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', false)
on conflict (id) do update set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('twin-portraits', 'twin-portraits', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Users can upload own recordings" on storage.objects;
create policy "Users can upload own recordings"
on storage.objects for insert
with check (
  bucket_id = 'recordings'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Users can view own recordings" on storage.objects;
create policy "Users can view own recordings"
on storage.objects for select
using (
  bucket_id = 'recordings'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Users can delete own recordings" on storage.objects;
create policy "Users can delete own recordings"
on storage.objects for delete
using (
  bucket_id = 'recordings'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Users can upload own twin portraits" on storage.objects;
create policy "Users can upload own twin portraits"
on storage.objects for insert
with check (
  bucket_id = 'twin-portraits'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Users can delete own twin portraits" on storage.objects;
create policy "Users can delete own twin portraits"
on storage.objects for delete
using (
  bucket_id = 'twin-portraits'
  and auth.uid()::text = (storage.foldername(name))[1]
);
