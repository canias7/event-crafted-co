-- Trust & safety reports: any signed-in user can flag a piece of
-- content (vendor profile, review, message, microsite, blog post,
-- editorial article). Admins triage from /admin/reports.
--
-- Anonymous users CAN'T report — too easy to abuse. Same email
-- can't double-report the same content (unique partial index).

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  content_type text not null check (content_type in (
    'vendor_profile', 'review', 'direct_message', 'microsite',
    'vendor_blog_post', 'editorial_article', 'mood_board',
    'inquiry_message', 'real_event'
  )),
  content_id uuid not null,
  reason text not null check (reason in (
    'spam', 'harassment', 'inappropriate', 'misleading',
    'impersonation', 'copyright', 'safety', 'other'
  )),
  details text,
  status text not null default 'open'
    check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  resolution_action text,
  resolution_notes text,
  created_at timestamptz not null default now()
);

create index content_reports_status_idx
  on public.content_reports (status, created_at desc);
create index content_reports_target_idx
  on public.content_reports (content_type, content_id);
create unique index content_reports_no_duplicate_idx
  on public.content_reports (reporter_id, content_type, content_id)
  where status in ('open', 'reviewing');

alter table public.content_reports enable row level security;

-- Reporter can see their own reports (so they can check status).
create policy "reports reporter select own"
  on public.content_reports for select
  to authenticated
  using (reporter_id = auth.uid());

-- Anyone signed in can report.
create policy "reports authenticated insert"
  on public.content_reports for insert
  to authenticated
  with check (reporter_id = auth.uid());

-- Admins can read all + update.
-- (Assumes a `profiles.role = 'admin'` flag — same pattern other
-- admin policies use throughout the codebase.)
create policy "reports admin select all"
  on public.content_reports for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "reports admin update"
  on public.content_reports for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );
