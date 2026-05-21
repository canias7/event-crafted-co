-- Move HILUX's lead-score classification + booking-intent timestamp
-- off `inquiries` into a vendor-only table. The host has SELECT
-- access to their own inquiries (they own them), so any column on
-- the inquiries table is host-readable. Without this move, the
-- host can see how the vendor classified them (hot/warm/cold) and
-- when HILUX decided they were ready to book.

create table public.inquiry_scores (
  inquiry_id uuid primary key references public.inquiries(id) on delete cascade,
  lead_score text check (lead_score in ('hot','warm','cold','unknown')),
  lead_score_reason text,
  lead_score_updated_at timestamptz,
  booking_intent_at timestamptz,
  booking_intent_reason text
);

-- Backfill from the existing columns. Only rows with any non-null
-- score field are worth carrying over; the rest stay implicit.
insert into public.inquiry_scores
  (inquiry_id, lead_score, lead_score_reason, lead_score_updated_at, booking_intent_at, booking_intent_reason)
select
  id, lead_score, lead_score_reason, lead_score_updated_at, booking_intent_at, booking_intent_reason
from public.inquiries
where lead_score is not null
   or booking_intent_at is not null
   or booking_intent_reason is not null;

alter table public.inquiries drop column lead_score;
alter table public.inquiries drop column lead_score_reason;
alter table public.inquiries drop column lead_score_updated_at;
alter table public.inquiries drop column booking_intent_at;
alter table public.inquiries drop column booking_intent_reason;

alter table public.inquiry_scores enable row level security;

-- Only vendor team members of the inquiry's vendor see the score.
-- Hosts have no SELECT here even though they own the inquiry row.
create policy "inquiry_scores vendor select"
  on public.inquiry_scores for select to authenticated
  using (
    exists (
      select 1 from public.inquiries i
      where i.id = inquiry_scores.inquiry_id
        and public.is_vendor_member(i.vendor_id)
    )
  );

create policy "inquiry_scores vendor insert"
  on public.inquiry_scores for insert to authenticated
  with check (
    exists (
      select 1 from public.inquiries i
      where i.id = inquiry_scores.inquiry_id
        and public.is_vendor_member(i.vendor_id)
    )
  );

create policy "inquiry_scores vendor update"
  on public.inquiry_scores for update to authenticated
  using (
    exists (
      select 1 from public.inquiries i
      where i.id = inquiry_scores.inquiry_id
        and public.is_vendor_member(i.vendor_id)
    )
  )
  with check (
    exists (
      select 1 from public.inquiries i
      where i.id = inquiry_scores.inquiry_id
        and public.is_vendor_member(i.vendor_id)
    )
  );

create policy "inquiry_scores vendor delete"
  on public.inquiry_scores for delete to authenticated
  using (
    exists (
      select 1 from public.inquiries i
      where i.id = inquiry_scores.inquiry_id
        and public.is_vendor_member(i.vendor_id)
    )
  );
