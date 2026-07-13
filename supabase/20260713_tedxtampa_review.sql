-- TEDxTampa revision/review system — run once in the Supabase SQL editor
-- (same Supabase project as Off Menu: kirmozciaosdbmndomhn).
-- Mirrors the Off Menu schema; anon access is gated by RLS to project = 'tedxtampa'.

create table if not exists tedxtampa_review_comments (
  id text primary key,
  project text not null,
  page text not null,
  path text not null,
  review_id text not null,
  selector text not null,
  text_quote text,
  comment text not null,
  status text not null default 'open',
  viewport jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  -- team replies + client acknowledgement (Off Menu's second migration, folded in)
  reply text,
  reply_at timestamptz,
  reply_ack boolean not null default false
);

create index if not exists tedxtampa_review_comments_proj_created_idx
  on tedxtampa_review_comments (project, created_at desc);
create index if not exists tedxtampa_review_comments_proj_reviewid_idx
  on tedxtampa_review_comments (project, review_id);

alter table tedxtampa_review_comments enable row level security;

drop policy if exists "TEDxTampa review reads" on tedxtampa_review_comments;
create policy "TEDxTampa review reads"
  on tedxtampa_review_comments for select to anon
  using (project = 'tedxtampa');

drop policy if exists "TEDxTampa review inserts" on tedxtampa_review_comments;
create policy "TEDxTampa review inserts"
  on tedxtampa_review_comments for insert to anon
  with check (project = 'tedxtampa');

drop policy if exists "TEDxTampa review updates" on tedxtampa_review_comments;
create policy "TEDxTampa review updates"
  on tedxtampa_review_comments for update to anon
  using (project = 'tedxtampa')
  with check (project = 'tedxtampa');
