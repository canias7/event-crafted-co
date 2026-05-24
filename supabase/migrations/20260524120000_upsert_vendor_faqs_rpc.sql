-- Transactional FAQ upsert for the edit-listing modal.
--
-- The previous flow looped UPDATEs + INSERTs in JS (parallel via
-- Promise.all). If one of 5 parallel FAQ writes failed, the other
-- 4 had already committed — vendor saw "Save failed" but their
-- listing had 4 partially-updated FAQs and 1 stale one. No
-- rollback because each call was its own transaction.
--
-- This RPC wraps the whole array in a single plpgsql function so
-- it runs as one transaction. Any error inside the loop aborts
-- the entire upsert; vendor sees the same toast but the data on
-- disk is whatever it was before the save attempt.

create or replace function public.upsert_vendor_faqs(
  p_vendor_id uuid,
  p_faqs jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  faq jsonb;
begin
  -- Ownership gate. SECURITY DEFINER bypasses RLS, so the
  -- function does the check itself via the existing helper.
  if not public.is_vendor_member(p_vendor_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  -- Iterate the input array. The function body is one transaction
  -- in plpgsql, so any failure inside raises and rolls back every
  -- prior UPDATE/INSERT in this call.
  for faq in select value from jsonb_array_elements(p_faqs)
  loop
    if (faq->>'id') is not null and (faq->>'id') <> '' then
      update public.vendor_faqs
         set question = faq->>'question',
             answer   = faq->>'answer'
       where id = (faq->>'id')::uuid
         and vendor_id = p_vendor_id;
    else
      insert into public.vendor_faqs (
        vendor_id, question, answer, display_order
      ) values (
        p_vendor_id,
        faq->>'question',
        faq->>'answer',
        coalesce((faq->>'display_order')::int, 0)
      );
    end if;
  end loop;
end;
$$;

revoke all on function public.upsert_vendor_faqs(uuid, jsonb)
  from public, anon;
grant execute on function public.upsert_vendor_faqs(uuid, jsonb)
  to authenticated;
