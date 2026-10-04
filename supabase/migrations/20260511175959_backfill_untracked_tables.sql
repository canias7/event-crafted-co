-- Backfill: these tables exist in production but were created outside
-- migrations, so a from-scratch replay (supabase start / CI) failed on the
-- first migration that referenced them. Column lists copied from production
-- (Oct 2026); constraints beyond primary keys are left to later migrations.
-- No-op in production (create table if not exists).
create table if not exists public.vendor_buzz (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid, user_id uuid, body text,
  created_at timestamptz not null default now()
);
create table if not exists public.vendor_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid, user_id uuid, body text,
  created_at timestamptz not null default now()
);
create table if not exists public.vendor_post_comment_likes (
  comment_id uuid not null, user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
create table if not exists public.vendor_contracts (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid, inquiry_id uuid, template_id uuid,
  title text, body text, recipient_name text, recipient_email text,
  status text not null default 'sent',
  sign_token text default encode(extensions.gen_random_bytes(16), 'hex'),
  signer_name text, signer_user_id uuid, verified_email text, signature_image text,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.contract_sign_otps (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid, email text, code_hash text, expires_at timestamptz,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.email_leads (
  id uuid primary key default gen_random_uuid(),
  email text, name text, source text, notes text,
  status text not null default 'new',
  created_by uuid, last_sent_at timestamptz, last_template_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.email_scraping_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid, role text, content text, metadata jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.host_signup_codes (
  email text primary key,
  code_hash text, expires_at timestamptz,
  attempts integer not null default 0,
  used_at timestamptz, requested_at timestamptz,
  request_window_started_at timestamptz,
  request_count_window integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.mobile_debug_events (
  id bigserial primary key,
  payload jsonb,
  created_at timestamptz not null default now()
);
