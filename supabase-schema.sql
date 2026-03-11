-- ============================================
-- Reports by Zeniva Digital — Phase 1 Schema
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

-- ── Reports (new narrative-driven format) ──
create table if not exists reports (
  id uuid default uuid_generate_v4() primary key,
  client_id uuid references clients(id) on delete cascade not null,
  owner_id uuid references auth.users(id) on delete cascade not null,
  month text not null,
  year integer not null,
  narrative text,
  pdf_url text,
  generated_at timestamptz default now(),
  unique(client_id, month, year)
);

-- ── Indexes ──
create index if not exists idx_clients_owner on clients(owner_id);
create index if not exists idx_campaigns_client on campaigns(client_id);
create index if not exists idx_campaign_metrics_campaign on campaign_metrics(campaign_id);
create index if not exists idx_campaign_metrics_date on campaign_metrics(date);
create index if not exists idx_ad_copy_client on ad_copy(client_id);
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
create policy "profiles_select" on profiles for select using (auth.uid() = id);
create policy "profiles_update" on profiles for update using (auth.uid() = id);

-- Clients
create policy "clients_select" on clients for select using (auth.uid() = owner_id);
create policy "clients_insert" on clients for insert with check (auth.uid() = owner_id);
create policy "clients_update" on clients for update using (auth.uid() = owner_id);
create policy "clients_delete" on clients for delete using (auth.uid() = owner_id);

-- Campaigns (via parent client ownership)
create policy "campaigns_select" on campaigns for select
  using (client_id in (select id from clients where owner_id = auth.uid()));
create policy "campaigns_insert" on campaigns for insert
  with check (client_id in (select id from clients where owner_id = auth.uid()));
create policy "campaigns_update" on campaigns for update
  using (client_id in (select id from clients where owner_id = auth.uid()));
create policy "campaigns_delete" on campaigns for delete
  using (client_id in (select id from clients where owner_id = auth.uid()));

-- Campaign Metrics (via campaign → client → owner chain)
create policy "metrics_select" on campaign_metrics for select
  using (campaign_id in (
    select c.id from campaigns c
    join clients cl on c.client_id = cl.id
    where cl.owner_id = auth.uid()
  ));

-- Ad Copy
create policy "ad_copy_select" on ad_copy for select
  using (client_id in (select id from clients where owner_id = auth.uid()));
create policy "ad_copy_insert" on ad_copy for insert
  with check (client_id in (select id from clients where owner_id = auth.uid()));
create policy "ad_copy_update" on ad_copy for update
  using (client_id in (select id from clients where owner_id = auth.uid()));

-- Reports
create policy "reports_select" on reports for select using (auth.uid() = owner_id);
create policy "reports_insert" on reports for insert with check (auth.uid() = owner_id);
create policy "reports_update" on reports for update using (auth.uid() = owner_id);
