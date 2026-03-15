-- ============================================================
-- Content Scheduler — Database Schema
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. page_connections — FB Page / IG Business account connections per client
CREATE TABLE IF NOT EXISTS page_connections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram')),
  page_id       TEXT NOT NULL,
  page_name     TEXT,
  page_access_token TEXT NOT NULL,
  token_expires_at  TIMESTAMPTZ,
  ig_business_account_id TEXT,  -- only on FB rows: the linked IG account
  connected_at  TIMESTAMPTZ DEFAULT now(),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (client_id, platform, page_id)
);

ALTER TABLE page_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "page_connections_org_access" ON page_connections
  FOR ALL USING (org_id = (SELECT org_id FROM org_members WHERE user_id = auth.uid() LIMIT 1));

-- 2. social_posts — Core content table (one row per draft/scheduled/published post)
CREATE TABLE IF NOT EXISTS social_posts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_by          UUID REFERENCES auth.users(id),
  caption             TEXT,
  platforms           JSONB DEFAULT '[]'::jsonb,        -- ["facebook","instagram"]
  media_urls          JSONB DEFAULT '[]'::jsonb,        -- array of public Supabase URLs
  media_storage_paths JSONB DEFAULT '[]'::jsonb,        -- array of storage paths for cleanup
  status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','scheduled','publishing','published','failed','partially_failed')),
  scheduled_at        TIMESTAMPTZ,                      -- NULL = draft
  published_at        TIMESTAMPTZ,
  fb_post_id          TEXT,
  ig_container_id     TEXT,
  ig_media_id         TEXT,
  publish_error       TEXT,
  publish_attempts    INT DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "social_posts_org_access" ON social_posts
  FOR ALL USING (org_id = (SELECT org_id FROM org_members WHERE user_id = auth.uid() LIMIT 1));

CREATE INDEX idx_social_posts_org_status    ON social_posts (org_id, status);
CREATE INDEX idx_social_posts_scheduled     ON social_posts (status, scheduled_at) WHERE status = 'scheduled';
CREATE INDEX idx_social_posts_client_sched  ON social_posts (client_id, scheduled_at);

-- 3. social_post_logs — Audit trail per publish attempt
CREATE TABLE IF NOT EXISTS social_post_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL,
  action        TEXT NOT NULL,     -- 'create_container', 'publish', 'schedule_fb', etc.
  success       BOOLEAN NOT NULL DEFAULT false,
  response      JSONB,             -- raw Meta API response
  error_message TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE social_post_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "social_post_logs_org_access" ON social_post_logs
  FOR ALL USING (
    post_id IN (SELECT id FROM social_posts WHERE org_id = (SELECT org_id FROM org_members WHERE user_id = auth.uid() LIMIT 1))
  );

CREATE INDEX idx_social_post_logs_post ON social_post_logs (post_id);

-- 4. Storage bucket (run via Supabase Dashboard or API)
-- INSERT INTO storage.buckets (id, name, public, file_size_limit)
-- VALUES ('social-content', 'social-content', true, 52428800)
-- ON CONFLICT (id) DO NOTHING;

-- 5. Updated_at trigger (reuse if you already have one)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_page_connections_updated
  BEFORE UPDATE ON page_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_social_posts_updated
  BEFORE UPDATE ON social_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
