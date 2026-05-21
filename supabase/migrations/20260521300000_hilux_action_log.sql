-- HILUX action audit log. Every reply, escalation, follow-up,
-- regeneration, and archive HILUX performs lands here so the
-- vendor (or Claude via the MCP connector) can review what HILUX
-- has been doing on their behalf.
--
-- Vendors only see their own rows (RLS by user_id). The service
-- role writes from the edge functions and bypasses RLS.

create table public.hilux_action_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vendor_id uuid references public.vendor_profiles(id) on delete set null,
  thread_id uuid references public.direct_threads(id) on delete set null,
  inquiry_id uuid references public.inquiries(id) on delete set null,
  message_id uuid references public.direct_messages(id) on delete set null,
  action text not null check (action in (
    'reply', 'escalate', 'follow_up', 'regenerate', 'archive_cold',
    'booking_intent_detected', 'lead_score_hot', 'fields_extracted'
  )),
  detail text,
  created_at timestamptz not null default now()
);

create index hilux_action_log_user_idx
  on public.hilux_action_log (user_id, created_at desc);

create index hilux_action_log_inquiry_idx
  on public.hilux_action_log (inquiry_id, created_at desc)
  where inquiry_id is not null;

alter table public.hilux_action_log enable row level security;

create policy "hilux_action_log select own"
  on public.hilux_action_log for select to authenticated
  using (user_id = auth.uid());

create policy "hilux_action_log delete own"
  on public.hilux_action_log for delete to authenticated
  using (user_id = auth.uid());
