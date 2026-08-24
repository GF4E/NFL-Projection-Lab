-- Owner-only launch seed. No teammate is invited or granted access.
-- Run after the owner has signed in once. Replace OWNER_USER_ID with auth.users.id.
with new_team as (
  insert into public.teams (name, season, unit_dollars)
  values ('NFL Projection Lab', 2026, 25)
  returning id
)
insert into public.team_members (team_id, user_id, email, display_name, role, joined_at)
select id, 'OWNER_USER_ID'::uuid, 'OWNER_EMAIL', 'Owner', 'owner', now() from new_team
;
