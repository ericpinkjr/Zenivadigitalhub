-- ============================================
-- Reports by Zeniva Digital — Full Schema
-- Safe to re-run (uses IF NOT EXISTS + DROP/CREATE for policies)
-- Run this in the Supabase SQL Editor
-- ============================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ── Profiles (with roles) ──
create table if not exists profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  full_name text,
  role text default 'admin' check (role in ('admin', 'manager', 'copywriter')),
  created_at timestamptz default now()
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'admin'
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ── Clients ──
create table if not exists clients (
  id uuid default uuid_generate_v4() primary key,
  owner_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  location text,
  industry text,
  target_audience text,
  brand_voice_notes text,
  meta_ad_account_id text,
  ig_business_account_id text,
  brand_color text default '#FF6B35',
  logo_url text,
  ig_handle text,
  tk_handle text,
  invoice_day integer,
  created_at timestamptz default now()
);

-- ── Campaigns ──
create table if not exists campaigns (
  id uuid default uuid_generate_v4() primary key,
  client_id uuid references clients(id) on delete cascade not null,
  name text not null,
  objective text,
  start_date date,
  end_date date,
  budget numeric(12,2),
  status text default 'active' check (status in ('active', 'paused', 'completed', 'draft')),
  meta_campaign_id text,
  created_at timestamptz default now()
);

-- ── Campaign Metrics (daily from Meta API) ──
create table if not exists campaign_metrics (
  id uuid default uuid_generate_v4() primary key,
  campaign_id uuid references campaigns(id) on delete cascade not null,
  date date not null,
  impressions bigint default 0,
  reach bigint default 0,
  clicks bigint default 0,
  spend numeric(10,2) default 0,
  ctr numeric(6,4) default 0,
  cpm numeric(10,4) default 0,
  conversions integer default 0,
  roas numeric(8,4) default 0,
  raw_response jsonb,
  synced_at timestamptz default now(),
  unique(campaign_id, date)
);

-- ── Ad Copy ──
create table if not exists ad_copy (
  id uuid default uuid_generate_v4() primary key,
  client_id uuid references clients(id) on delete cascade not null,
  campaign_id uuid references campaigns(id) on delete set null,
  headline text,
  primary_text text,
  cta text,
  status text default 'draft' check (status in ('draft', 'approved', 'live')),
  created_at timestamptz default now()
);

-- ── Instagram Account Metrics (daily organic data from IG Graph API) ──
create table if not exists ig_account_metrics (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references clients(id) on delete cascade not null,
  date date not null,
  followers_count integer,
  impressions integer,
  reach integer,
  profile_views integer,
  website_clicks integer,
  follower_count_delta integer,
  media_count integer,
  synced_at timestamptz default now(),
  unique(client_id, date)
);

-- ── Instagram Media Metrics (per-post organic data) ──
create table if not exists ig_media_metrics (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references clients(id) on delete cascade not null,
  ig_media_id text not null,
  timestamp timestamptz,
  media_type text,
  caption text,
  permalink text,
  like_count integer,
  comments_count integer,
  impressions integer,
  reach integer,
  saved integer,
  shares integer,
  synced_at timestamptz default now(),
  unique(client_id, ig_media_id)
);

-- ── Reports ──
create table if not exists reports (
  id uuid default uuid_generate_v4() primary key,
  client_id uuid references clients(id) on delete cascade not null,
  owner_id uuid references auth.users(id) on delete cascade not null,
  month text not null,
  year integer not null,
  prepared_by text,
  published boolean default false,
  share_slug text,
  platforms text,
  top_posts text,
  narrative text,
  pdf_url text,
  -- Instagram metrics
  ig_handle text,
  ig_screenshot_url text,
  ig_followers bigint,
  ig_new_followers bigint,
  ig_unfollows bigint,
  ig_reach bigint,
  ig_views bigint,
  ig_non_follower_reach_pct numeric(6,2),
  ig_likes bigint,
  ig_comments bigint,
  ig_shares bigint,
  ig_saves bigint,
  ig_profile_visits bigint,
  ig_website_taps bigint,
  ig_call_taps bigint,
  ig_direction_taps bigint,
  ig_posts integer,
  ig_reels_published integer,
  ig_stories_published integer,
  ig_posts_reach bigint,
  ig_reels_reach bigint,
  ig_stories_reach bigint,
  -- TikTok metrics
  tk_handle text,
  tk_screenshot_url text,
  tk_followers bigint,
  tk_net_followers bigint,
  tk_video_views bigint,
  tk_total_viewers bigint,
  tk_new_viewers bigint,
  tk_likes bigint,
  tk_comments bigint,
  tk_shares bigint,
  tk_saves bigint,
  tk_for_you_pct numeric(6,2),
  tk_search_pct numeric(6,2),
  tk_profile_views bigint,
  tk_videos integer,
  -- Facebook & Google (stored as JSON)
  fb_data text,
  google_data text,
  -- Meta Ads aggregates
  meta_spend numeric(10,2),
  meta_impressions bigint,
  meta_reach bigint,
  meta_clicks bigint,
  meta_ctr numeric(6,4),
  meta_cpm numeric(10,4),
  meta_conversions integer,
  meta_roas numeric(8,4),
  -- AI insights
  ai_summary text,
  ai_ig_insight text,
  ai_tk_insight text,
  ai_headline_win text,
  ai_watch_out text,
  -- Timestamps
  created_at timestamptz default now(),
  generated_at timestamptz default now(),
  unique(client_id, month, year)
);

-- ── Indexes ──
create index if not exists idx_clients_owner on clients(owner_id);
create index if not exists idx_campaigns_client on campaigns(client_id);
create index if not exists idx_campaign_metrics_campaign on campaign_metrics(campaign_id);
create index if not exists idx_campaign_metrics_date on campaign_metrics(date);
create index if not exists idx_ad_copy_client on ad_copy(client_id);
create index if not exists idx_ig_account_metrics_client_date on ig_account_metrics(client_id, date);
create index if not exists idx_ig_media_client on ig_media_metrics(client_id);
create index if not exists idx_ig_media_timestamp on ig_media_metrics(timestamp);
create index if not exists idx_reports_client on reports(client_id);

-- ============================================
-- Row Level Security
-- ============================================

alter table clients enable row level security;
alter table campaigns enable row level security;
alter table campaign_metrics enable row level security;
alter table ad_copy enable row level security;
alter table reports enable row level security;
alter table profiles enable row level security;

-- Profiles
drop policy if exists "profiles_select" on profiles;
create policy "profiles_select" on profiles for select using (auth.uid() = id);
drop policy if exists "profiles_update" on profiles;
create policy "profiles_update" on profiles for update using (auth.uid() = id);

-- Clients
drop policy if exists "clients_select" on clients;
create policy "clients_select" on clients for select using (auth.uid() = owner_id);
drop policy if exists "clients_insert" on clients;
create policy "clients_insert" on clients for insert with check (auth.uid() = owner_id);
drop policy if exists "clients_update" on clients;
create policy "clients_update" on clients for update using (auth.uid() = owner_id);
drop policy if exists "clients_delete" on clients;
create policy "clients_delete" on clients for delete using (auth.uid() = owner_id);

-- Campaigns (via parent client ownership)
drop policy if exists "campaigns_select" on campaigns;
create policy "campaigns_select" on campaigns for select
  using (client_id in (select id from clients where owner_id = auth.uid()));
drop policy if exists "campaigns_insert" on campaigns;
create policy "campaigns_insert" on campaigns for insert
  with check (client_id in (select id from clients where owner_id = auth.uid()));
drop policy if exists "campaigns_update" on campaigns;
create policy "campaigns_update" on campaigns for update
  using (client_id in (select id from clients where owner_id = auth.uid()));
drop policy if exists "campaigns_delete" on campaigns;
create policy "campaigns_delete" on campaigns for delete
  using (client_id in (select id from clients where owner_id = auth.uid()));

-- Campaign Metrics (via campaign → client → owner chain)
drop policy if exists "metrics_select" on campaign_metrics;
create policy "metrics_select" on campaign_metrics for select
  using (campaign_id in (
    select c.id from campaigns c
    join clients cl on c.client_id = cl.id
    where cl.owner_id = auth.uid()
  ));

-- Ad Copy
drop policy if exists "ad_copy_select" on ad_copy;
create policy "ad_copy_select" on ad_copy for select
  using (client_id in (select id from clients where owner_id = auth.uid()));
drop policy if exists "ad_copy_insert" on ad_copy;
create policy "ad_copy_insert" on ad_copy for insert
  with check (client_id in (select id from clients where owner_id = auth.uid()));
drop policy if exists "ad_copy_update" on ad_copy;
create policy "ad_copy_update" on ad_copy for update
  using (client_id in (select id from clients where owner_id = auth.uid()));

-- IG Account Metrics
alter table ig_account_metrics enable row level security;
drop policy if exists "ig_account_metrics_select" on ig_account_metrics;
create policy "ig_account_metrics_select" on ig_account_metrics for select
  using (client_id in (select id from clients where owner_id = auth.uid()));
drop policy if exists "ig_account_metrics_insert" on ig_account_metrics;
create policy "ig_account_metrics_insert" on ig_account_metrics for insert
  with check (client_id in (select id from clients where owner_id = auth.uid()));

-- IG Media Metrics
alter table ig_media_metrics enable row level security;
drop policy if exists "ig_media_metrics_select" on ig_media_metrics;
create policy "ig_media_metrics_select" on ig_media_metrics for select
  using (client_id in (select id from clients where owner_id = auth.uid()));
drop policy if exists "ig_media_metrics_insert" on ig_media_metrics;
create policy "ig_media_metrics_insert" on ig_media_metrics for insert
  with check (client_id in (select id from clients where owner_id = auth.uid()));

-- Reports
drop policy if exists "reports_select" on reports;
create policy "reports_select" on reports for select using (auth.uid() = owner_id);
drop policy if exists "reports_insert" on reports;
create policy "reports_insert" on reports for insert with check (auth.uid() = owner_id);
drop policy if exists "reports_update" on reports;
create policy "reports_update" on reports for update using (auth.uid() = owner_id);
