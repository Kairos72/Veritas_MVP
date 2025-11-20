-- Enable Row Level Security
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;

-- PROJECTS TABLE
create table public.projects (
  project_id text not null primary key,
  project_title text,
  contract_id text,
  contractor_name text,
  owner text,
  project_type text,
  location text,
  start_date date,
  end_date date,
  notes text,
  owner_user_id uuid references auth.users not null default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.projects enable row level security;

create policy "Users can view their own projects" on public.projects
  for select using (auth.uid() = owner_user_id);

create policy "Users can insert their own projects" on public.projects
  for insert with check (auth.uid() = owner_user_id);

create policy "Users can update their own projects" on public.projects
  for update using (auth.uid() = owner_user_id);

create policy "Users can delete their own projects" on public.projects
  for delete using (auth.uid() = owner_user_id);

-- FIELD LOGS TABLE
create table public.field_logs (
  entry_id text not null primary key,
  date date,
  segment_id text,
  shift_output_blocks numeric,
  cumulative_blocks numeric,
  remaining_blocks numeric,
  remaining_meters numeric,
  crew_size numeric,
  weather text,
  notes text,
  latitude text,
  longitude text,
  photo_base64 text, -- Storing base64 directly for MVP simplicity
  project_id text references public.projects(project_id),
  owner_user_id uuid references auth.users not null default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.field_logs enable row level security;

create policy "Users can view their own logs" on public.field_logs
  for select using (auth.uid() = owner_user_id);

create policy "Users can insert their own logs" on public.field_logs
  for insert with check (auth.uid() = owner_user_id);

create policy "Users can update their own logs" on public.field_logs
  for update using (auth.uid() = owner_user_id);

create policy "Users can delete their own logs" on public.field_logs
  for delete using (auth.uid() = owner_user_id);

-- SEGMENTS TABLE (Optional for now, but good to have)
create table public.segments (
  segment_id text not null primary key,
  project_id text references public.projects(project_id),
  length numeric,
  width numeric,
  owner_user_id uuid references auth.users not null default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.segments enable row level security;

create policy "Users can view their own segments" on public.segments
  for select using (auth.uid() = owner_user_id);

create policy "Users can insert their own segments" on public.segments
  for insert with check (auth.uid() = owner_user_id);

create policy "Users can update their own segments" on public.segments
  for update using (auth.uid() = owner_user_id);

create policy "Users can delete their own segments" on public.segments
  for delete using (auth.uid() = owner_user_id);
