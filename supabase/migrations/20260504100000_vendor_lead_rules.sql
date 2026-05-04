-- Vendor lead-routing rules — auto-replies + auto-decline + budget
-- floor. Vendors set these once on their profile and the inquiry
-- pipeline applies them automatically to incoming inquiries.
--
-- Schema: extend vendor_profiles with the rules columns. Keeping
-- them inline (vs. a separate vendor_lead_rules table) is fine
-- because the rule set is small and per-vendor — there's no n:m
-- relationship here.
--
-- The actual auto-application happens via a trigger on
-- inquiries.insert: if the vendor has auto_decline_below_cents and
-- the host's budget_max_cents is below it, status flips to lost
-- and an auto-reply message lands in the thread.

alter table public.vendor_profiles
  add column if not exists auto_reply_template text,
  add column if not exists auto_decline_below_cents integer
    check (auto_decline_below_cents is null or auto_decline_below_cents >= 0),
  add column if not exists auto_decline_message text,
  add column if not exists auto_reply_enabled boolean
    not null default false;

-- Trigger: apply lead routing rules on insert. Runs as the inserter
-- (host); reads vendor_profiles + inserts a system message + flips
-- inquiry status when the rules say so. Lightweight — just two
-- conditional inserts.
create or replace function public.tg_inquiries_apply_lead_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  vp record;
begin
  select
    auto_reply_enabled,
    auto_reply_template,
    auto_decline_below_cents,
    auto_decline_message
  into vp
  from public.vendor_profiles
  where id = NEW.vendor_id;

  if vp.auto_reply_enabled is null then
    return NEW;
  end if;

  -- Auto-decline below budget floor.
  if vp.auto_decline_below_cents is not null
    and NEW.budget_max_cents is not null
    and NEW.budget_max_cents < vp.auto_decline_below_cents then
    -- Patch the new row in-place so the change persists.
    NEW.status = 'lost';
    -- Drop a system message so the host sees the explanation.
    insert into public.messages (
      inquiry_id, sender_role, body, is_draft
    ) values (
      NEW.id,
      'vendor',
      coalesce(
        vp.auto_decline_message,
        'Thanks for reaching out — unfortunately your budget is below our minimum for this kind of event. We hope you find the right fit.'
      ),
      false
    );
    return NEW;
  end if;

  -- Auto-reply otherwise (when enabled).
  if vp.auto_reply_enabled and vp.auto_reply_template is not null then
    insert into public.messages (
      inquiry_id, sender_role, body, is_draft
    ) values (
      NEW.id,
      'vendor',
      vp.auto_reply_template,
      false
    );
  end if;

  return NEW;
end;
$$;

drop trigger if exists inquiries_apply_lead_rules on public.inquiries;
create trigger inquiries_apply_lead_rules
  before insert on public.inquiries
  for each row execute function public.tg_inquiries_apply_lead_rules();
