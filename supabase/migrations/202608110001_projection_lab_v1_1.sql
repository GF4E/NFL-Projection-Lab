create extension if not exists pgcrypto;

create type public.book_key as enum ('betmgm', 'fanduel');
create type public.market_key as enum ('spread', 'total', 'moneyline');
create type public.execution_status as enum ('executed', 'paper');
create type public.team_pick_status as enum ('draft', 'awaiting_approval', 'approved', 'locked', 'settled', 'push', 'void');
create type public.model_status as enum ('champion', 'challenger', 'rejected');
create type public.data_freshness as enum ('current', 'stale', 'partial', 'unavailable');
create type public.member_role as enum ('owner', 'teammate');
create type public.push_event_type as enum ('awaiting_you', 'edge_threshold');

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  season integer not null check (season = 2026),
  unit_dollars numeric not null default 25 check (unit_dollars = 25),
  created_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  role public.member_role not null,
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  primary key (team_id, email),
  unique (team_id, user_id)
);

create table public.config_versions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  version text not null,
  season integer not null,
  frozen boolean not null,
  era_config jsonb not null,
  structural_config jsonb not null,
  config_hash text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (team_id, version)
);

create table public.odds_snapshots (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  snapshot_key text not null,
  game_id text not null,
  book public.book_key not null,
  market public.market_key not null,
  side text not null,
  point numeric,
  american_price integer not null check (american_price <> 0),
  captured_at timestamptz not null,
  source_hash text not null,
  quota_headers jsonb not null default '{}'::jsonb,
  freshness public.data_freshness not null default 'current',
  unique (team_id, snapshot_key, book, market, side)
);

create table public.discrete_margin_artifacts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  season_start integer not null check (season_start = 2010),
  season_end integer not null,
  boundary_season integer not null check (boundary_season = 2015),
  decay_config jsonb not null,
  spread_grid jsonb not null,
  probability_table jsonb not null,
  key_margin_masses jsonb not null,
  artifact_hash text not null,
  generated_at timestamptz not null,
  offseason_run_id uuid,
  unique (team_id, artifact_hash)
);

create table public.model_runs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  status public.model_status not null,
  champion_version_hash text not null,
  challenger_version_hash text not null,
  champion_metrics jsonb not null,
  challenger_metrics jsonb not null,
  gate_decision text not null check (gate_decision in ('promote', 'retain')),
  data_snapshot_hash text not null,
  config_hash text not null,
  feature_schema_hash text not null,
  code_hash text not null,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  promoted_at timestamptz
);

create table public.forecasts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  model_run_id uuid not null references public.model_runs(id),
  game_id text not null,
  market public.market_key not null,
  selection text not null,
  champion_hash text not null,
  config_hash text not null,
  data_hash text not null,
  model_probability numeric not null check (model_probability between 0 and 1),
  consensus_probability numeric not null check (consensus_probability between 0 and 1),
  shrunk_probability numeric not null check (shrunk_probability between 0 and 1),
  uncertainty_interval numrange not null,
  edge numeric not null,
  suggested_units numeric not null check (suggested_units between 0 and 2),
  units_greyed boolean not null,
  target_week integer not null,
  inputs_through_week integer not null check (inputs_through_week < target_week),
  weather_input jsonb,
  qb_input jsonb not null,
  freshness public.data_freshness not null,
  generated_at timestamptz not null
);

create table public.book_evaluations (
  id uuid primary key default gen_random_uuid(),
  forecast_id uuid not null references public.forecasts(id) on delete cascade,
  book public.book_key not null,
  raw_snapshot_id uuid not null references public.odds_snapshots(id),
  opposing_snapshot_id uuid not null references public.odds_snapshots(id),
  canonical_point numeric,
  translated_american_price numeric,
  power_exponent numeric not null,
  fair_probability numeric not null,
  shrunk_probability numeric,
  expected_value numeric,
  edge numeric,
  uncertainty_interval numrange,
  translation_warning text not null,
  unique (forecast_id, book)
);

create table public.team_picks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  current_revision integer not null default 1,
  current_status public.team_pick_status not null default 'draft',
  created_at timestamptz not null default now()
);

create table public.team_pick_revisions (
  id uuid primary key default gen_random_uuid(),
  pick_id uuid not null references public.team_picks(id) on delete cascade,
  revision integer not null,
  game_id text not null,
  kickoff_at timestamptz not null,
  market public.market_key not null,
  selection text not null,
  units numeric not null check (units >= 0.5 and units <= 2 and mod(units, 0.5) = 0),
  execution_status public.execution_status not null,
  book public.book_key not null,
  frozen_point numeric,
  frozen_price integer not null check (frozen_price <> 0),
  consensus_snapshot_id uuid not null references public.odds_snapshots(id),
  rationale text not null check (length(trim(rationale)) > 0),
  author_id uuid not null references auth.users(id),
  model_hash text not null,
  data_hash text not null,
  uncertainty_interval numrange not null,
  revision_hash text not null,
  created_at timestamptz not null default now(),
  unique (pick_id, revision),
  unique (pick_id, revision_hash)
);

create table public.pick_approvals (
  revision_id uuid not null references public.team_pick_revisions(id) on delete cascade,
  teammate_id uuid not null references auth.users(id),
  revision_hash text not null,
  approved_at timestamptz not null default now(),
  cash_placement_confirmed boolean not null default false,
  primary key (revision_id, teammate_id)
);

create table public.qb_overrides (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  game_id text not null,
  value numeric not null,
  source_url text not null,
  rationale text not null,
  author_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  audit_hash text not null
);

create table public.system_alerts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  type text not null,
  severity text not null,
  message text not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  unique (team_id, idempotency_key)
);

create table public.weekly_digests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  season integer not null,
  week integer not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (team_id, season, week)
);

create table public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  type public.push_event_type not null,
  recipient_id uuid not null references auth.users(id),
  idempotency_key text not null,
  state text not null check (state in ('pending', 'sent', 'failed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (team_id, idempotency_key)
);

create table public.settled_picks (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null unique references public.team_pick_revisions(id),
  result text not null check (result in ('win', 'loss', 'push', 'void')),
  profit_units numeric not null,
  closing_book public.book_key,
  closing_snapshot_id uuid references public.odds_snapshots(id),
  synthetic_closing_price numeric,
  clv_points numeric,
  clv_cents numeric,
  settled_at timestamptz not null,
  corrected_at timestamptz,
  corrected_by uuid references auth.users(id),
  correction_reason text
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_team_member(target_team uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where team_id = target_team and user_id = auth.uid()
  );
$$;

create or replace function public.is_team_owner(target_team uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where team_id = target_team and user_id = auth.uid() and role = 'owner'
  );
$$;

create or replace function public.reject_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'immutable record cannot be updated or deleted';
end;
$$;

create or replace function public.allow_forecast_freshness_only()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'immutable record cannot be deleted';
  end if;
  if (to_jsonb(new) - 'freshness') <> (to_jsonb(old) - 'freshness') then
    raise exception 'only forecast freshness may change after generation';
  end if;
  return new;
end;
$$;

create trigger immutable_odds before update or delete on public.odds_snapshots
for each row execute function public.reject_mutation();
create trigger immutable_margin_artifacts before update or delete on public.discrete_margin_artifacts
for each row execute function public.reject_mutation();
create trigger immutable_model_runs before update or delete on public.model_runs
for each row execute function public.reject_mutation();
create trigger immutable_forecasts before update or delete on public.forecasts
for each row execute function public.allow_forecast_freshness_only();
create trigger immutable_revisions before update or delete on public.team_pick_revisions
for each row execute function public.reject_mutation();
create trigger immutable_approvals before update or delete on public.pick_approvals
for each row execute function public.reject_mutation();
create trigger immutable_qb_overrides before update or delete on public.qb_overrides
for each row execute function public.reject_mutation();

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.config_versions enable row level security;
alter table public.odds_snapshots enable row level security;
alter table public.discrete_margin_artifacts enable row level security;
alter table public.model_runs enable row level security;
alter table public.forecasts enable row level security;
alter table public.book_evaluations enable row level security;
alter table public.team_picks enable row level security;
alter table public.team_pick_revisions enable row level security;
alter table public.pick_approvals enable row level security;
alter table public.qb_overrides enable row level security;
alter table public.system_alerts enable row level security;
alter table public.weekly_digests enable row level security;
alter table public.push_deliveries enable row level security;
alter table public.settled_picks enable row level security;
alter table public.audit_log enable row level security;

create policy team_read on public.teams for select using (public.is_team_member(id));
create policy member_read on public.team_members for select using (public.is_team_member(team_id));
create policy owner_manage_members on public.team_members for all using (public.is_team_owner(team_id)) with check (public.is_team_owner(team_id));
create policy member_read_config on public.config_versions for select using (public.is_team_member(team_id));
create policy owner_write_config on public.config_versions for insert with check (public.is_team_owner(team_id));
create policy member_read_odds on public.odds_snapshots for select using (public.is_team_member(team_id));
create policy member_read_margin on public.discrete_margin_artifacts for select using (public.is_team_member(team_id));
create policy member_read_runs on public.model_runs for select using (public.is_team_member(team_id));
create policy member_read_forecasts on public.forecasts for select using (public.is_team_member(team_id));
create policy member_read_book_evaluations on public.book_evaluations for select using (
  exists (select 1 from public.forecasts f where f.id = forecast_id and public.is_team_member(f.team_id))
);
create policy member_read_picks on public.team_picks for select using (public.is_team_member(team_id));
create policy member_create_picks on public.team_picks for insert with check (public.is_team_member(team_id));
create policy member_update_pick_state on public.team_picks for update using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
create policy member_read_revisions on public.team_pick_revisions for select using (
  exists (select 1 from public.team_picks p where p.id = pick_id and public.is_team_member(p.team_id))
);
create policy member_create_revisions on public.team_pick_revisions for insert with check (
  author_id = auth.uid() and exists (select 1 from public.team_picks p where p.id = pick_id and public.is_team_member(p.team_id))
);
create policy member_read_approvals on public.pick_approvals for select using (
  exists (
    select 1 from public.team_pick_revisions r
    join public.team_picks p on p.id = r.pick_id
    where r.id = revision_id and public.is_team_member(p.team_id)
  )
);
create policy member_approve_self on public.pick_approvals for insert with check (
  teammate_id = auth.uid() and exists (
    select 1 from public.team_pick_revisions r
    join public.team_picks p on p.id = r.pick_id
    where r.id = revision_id and public.is_team_member(p.team_id)
  )
);
create policy member_read_qb_overrides on public.qb_overrides for select using (public.is_team_member(team_id));
create policy owner_write_qb_overrides on public.qb_overrides for insert with check (public.is_team_owner(team_id) and author_id = auth.uid());
create policy member_read_alerts on public.system_alerts for select using (public.is_team_member(team_id));
create policy member_ack_alerts on public.system_alerts for update using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
create policy member_read_digests on public.weekly_digests for select using (public.is_team_member(team_id));
create policy member_read_push on public.push_deliveries for select using (public.is_team_member(team_id));
create policy member_read_settled on public.settled_picks for select using (
  exists (
    select 1 from public.team_pick_revisions r
    join public.team_picks p on p.id = r.pick_id
    where r.id = revision_id and public.is_team_member(p.team_id)
  )
);
create policy owner_correct_settled on public.settled_picks for update using (
  exists (
    select 1 from public.team_pick_revisions r
    join public.team_picks p on p.id = r.pick_id
    where r.id = revision_id and public.is_team_owner(p.team_id)
  )
);
create policy member_read_audit on public.audit_log for select using (public.is_team_member(team_id));

-- The service role is used only by authenticated cron jobs for provider imports, model runs,
-- forecasts, settlement, digests, and push delivery. It bypasses RLS by Supabase design.
