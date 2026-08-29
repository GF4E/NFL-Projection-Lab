create table public.pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  job_name text not null,
  idempotency_key text not null,
  status text not null check (status in ('running', 'completed', 'failed', 'aborted')),
  freshness public.data_freshness not null,
  input_hash text,
  output_hash text,
  error_message text,
  scheduled_for timestamptz not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (team_id, idempotency_key)
);

create table public.raw_data_snapshots (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  provider text not null,
  dataset text not null,
  snapshot_key text not null,
  source_url text not null,
  source_timestamp timestamptz not null,
  raw_hash text not null,
  row_count integer,
  schema_columns text[],
  payload jsonb,
  freshness public.data_freshness not null,
  created_at timestamptz not null default now(),
  unique (team_id, snapshot_key)
);

create table public.normalized_injuries (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  game_id text not null,
  player text not null,
  nfl_team text not null,
  practice_status text,
  game_status text,
  inactive boolean,
  source_url text not null,
  source_timestamp timestamptz not null,
  raw_snapshot_hash text not null,
  imported_at timestamptz not null default now(),
  unique (team_id, game_id, player, raw_snapshot_hash)
);

create table public.weather_inputs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  game_id text not null,
  stadium text not null,
  roof text not null check (roof in ('outdoor', 'open', 'closed', 'fixed', 'unconfirmed')),
  kickoff_at timestamptz not null,
  forecast_issued_at timestamptz not null,
  valid_at timestamptz not null,
  wind_mph numeric,
  temperature_f numeric,
  precipitation_probability numeric,
  source_hash text not null,
  created_at timestamptz not null default now(),
  unique (team_id, game_id, forecast_issued_at)
);

create table public.team_strength_states (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  nfl_team text not null,
  season integer not null,
  through_week integer not null,
  mean numeric not null,
  variance numeric not null check (variance > 0),
  data_hash text not null,
  created_at timestamptz not null default now(),
  unique (team_id, nfl_team, season, through_week, data_hash)
);

create table public.rolling_features (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  nfl_team text not null,
  season integer not null,
  through_week integer not null,
  epa numeric not null,
  success_rate numeric not null,
  explosive_rate numeric not null,
  regressed_turnovers numeric not null,
  pace numeric not null,
  proe numeric not null,
  data_hash text not null,
  created_at timestamptz not null default now(),
  unique (team_id, nfl_team, season, through_week, data_hash)
);

create table public.credit_usage (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  billing_period text not null,
  response_used integer not null,
  response_remaining integer not null,
  response_last_cost integer not null,
  projected_usage integer not null,
  throttle_state text[] not null default '{}',
  captured_at timestamptz not null,
  unique (team_id, captured_at)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_secret text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (team_id, user_id, endpoint)
);

create or replace function public.limit_team_to_two_members()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.team_members where team_id = new.team_id) >= 2 then
    raise exception 'NFL Projection Lab permits exactly two team members';
  end if;
  return new;
end;
$$;

create trigger team_member_limit before insert on public.team_members
for each row execute function public.limit_team_to_two_members();

create or replace function public.claim_team_invitation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.team_members
  set user_id = new.id, joined_at = coalesce(joined_at, now())
  where lower(email) = lower(new.email)
    and user_id is null;
  return new;
end;
$$;

create trigger claim_projection_lab_invite
after insert or update of email on auth.users
for each row execute function public.claim_team_invitation();

create or replace function public.validate_pick_approval()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target_revision public.team_pick_revisions%rowtype;
  target_pick public.team_picks%rowtype;
  latest_quote public.odds_snapshots%rowtype;
  prior_approvals integer;
begin
  select * into target_revision from public.team_pick_revisions where id = new.revision_id;
  select * into target_pick from public.team_picks where id = target_revision.pick_id;
  if not public.is_team_member(target_pick.team_id) or new.teammate_id <> auth.uid() then
    raise exception 'approval actor is not an authenticated team member';
  end if;
  if now() >= target_revision.kickoff_at then
    raise exception 'approval is closed at kickoff';
  end if;
  if new.revision_hash <> target_revision.revision_hash then
    raise exception 'approval hash does not match immutable revision';
  end if;
  if target_pick.current_revision <> target_revision.revision then
    raise exception 'only the current revision can be approved';
  end if;
  select * into latest_quote from public.odds_snapshots
    where team_id = target_pick.team_id
      and game_id = target_revision.game_id
      and book = target_revision.book
      and market = target_revision.market
      and side = target_revision.selection
    order by captured_at desc limit 1;
  if latest_quote.id is null
    or latest_quote.point is distinct from target_revision.frozen_point
    or latest_quote.american_price <> target_revision.frozen_price then
    raise exception 'quote changed; create a refreshed immutable revision';
  end if;
  select count(*) into prior_approvals from public.pick_approvals where revision_id = new.revision_id;
  if prior_approvals = 1 and target_revision.execution_status = 'executed' and not new.cash_placement_confirmed then
    raise exception 'second approval of executed pick requires cash placement confirmation';
  end if;
  return new;
end;
$$;

create trigger approval_contract_guard before insert on public.pick_approvals
for each row execute function public.validate_pick_approval();

create or replace function public.advance_pick_after_approval()
returns trigger language plpgsql security definer set search_path = public as $$
declare approval_count integer;
begin
  select count(*) into approval_count from public.pick_approvals where revision_id = new.revision_id;
  update public.team_picks p set current_status = case when approval_count >= 2 then 'approved'::public.team_pick_status else 'awaiting_approval'::public.team_pick_status end
  from public.team_pick_revisions r where r.id = new.revision_id and p.id = r.pick_id;
  return new;
end;
$$;

create trigger approval_state_advance after insert on public.pick_approvals
for each row execute function public.advance_pick_after_approval();

drop policy if exists member_update_pick_state on public.team_picks;

alter table public.pipeline_runs enable row level security;
alter table public.raw_data_snapshots enable row level security;
alter table public.normalized_injuries enable row level security;
alter table public.weather_inputs enable row level security;
alter table public.team_strength_states enable row level security;
alter table public.rolling_features enable row level security;
alter table public.credit_usage enable row level security;
alter table public.push_subscriptions enable row level security;

create policy member_read_pipeline_runs on public.pipeline_runs for select using (public.is_team_member(team_id));
create policy member_read_raw_snapshots on public.raw_data_snapshots for select using (public.is_team_member(team_id));
create policy member_read_injuries on public.normalized_injuries for select using (public.is_team_member(team_id));
create policy member_read_weather on public.weather_inputs for select using (public.is_team_member(team_id));
create policy member_read_strength on public.team_strength_states for select using (public.is_team_member(team_id));
create policy member_read_features on public.rolling_features for select using (public.is_team_member(team_id));
create policy member_read_credit on public.credit_usage for select using (public.is_team_member(team_id));
create policy member_manage_own_push on public.push_subscriptions for all
using (public.is_team_member(team_id) and user_id = auth.uid())
with check (public.is_team_member(team_id) and user_id = auth.uid());

create trigger immutable_pipeline_runs before delete on public.pipeline_runs
for each row execute function public.reject_mutation();
create trigger immutable_raw_snapshots before update or delete on public.raw_data_snapshots
for each row execute function public.reject_mutation();
create trigger immutable_injuries before update or delete on public.normalized_injuries
for each row execute function public.reject_mutation();
create trigger immutable_weather before update or delete on public.weather_inputs
for each row execute function public.reject_mutation();
create trigger immutable_strength before update or delete on public.team_strength_states
for each row execute function public.reject_mutation();
create trigger immutable_features before update or delete on public.rolling_features
for each row execute function public.reject_mutation();
create trigger immutable_credit before update or delete on public.credit_usage
for each row execute function public.reject_mutation();
