-- Admin user deletion was failing with "Direct deletion from storage
-- tables is not allowed. Use the Storage API instead." Three of the
-- storage-cleanup triggers (on direct_messages, vendor_showcase_clips,
-- vendor_verifications) lacked exception handlers, so when Supabase's
-- storage.objects guard rejects a direct DELETE, the error propagates
-- up and aborts the parent cascade (delete user → delete public.*
-- rows → trigger fires → storage delete blocked → whole txn rolls back).
--
-- The other six storage-cleanup triggers already wrap their delete in
-- `exception when others then null` for exactly this reason. Bringing
-- the three stragglers in line. Best-effort storage cleanup; orphan
-- objects (if any) get swept by the storage lifecycle policy.
--
-- Longer-term: move storage cleanup out of triggers into an edge
-- function that uses the Storage API. For now, this unblocks admin
-- user delete.

create or replace function public.tg_direct_message_storage_cleanup()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_att jsonb;
  v_url text;
  v_path text;
begin
  if old.attachments is null
     or jsonb_array_length(coalesce(old.attachments,'[]'::jsonb)) = 0 then
    return old;
  end if;
  for v_att in select jsonb_array_elements(old.attachments) loop
    v_path := v_att->>'storage_path';
    if v_path is null or v_path = '' then
      v_url := v_att->>'url';
      if v_url is null or v_url = '' then continue; end if;
      v_path := public.storage_path_from_public_url(
        'message-attachments', v_url
      );
    end if;
    if v_path is null then continue; end if;
    begin
      delete from storage.objects
        where bucket_id = 'message-attachments' and name = v_path;
    exception when others then
      -- Storage API guard or any other failure: keep cascading.
      null;
    end;
  end loop;
  return old;
end
$$;

create or replace function public.tg_vendor_showcase_clip_storage_cleanup()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if old.video_path is not null and old.video_path <> '' then
    begin
      delete from storage.objects
        where bucket_id = 'vendor-showcase-clips' and name = old.video_path;
    exception when others then null;
    end;
  end if;
  if old.poster_path is not null and old.poster_path <> '' then
    begin
      delete from storage.objects
        where bucket_id = 'vendor-showcase-clips' and name = old.poster_path;
    exception when others then null;
    end;
  end if;
  return old;
end
$$;

create or replace function public.tg_vendor_verification_storage_cleanup()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if old.document_path is not null and old.document_path <> '' then
    begin
      delete from storage.objects
        where bucket_id = 'vendor-verifications' and name = old.document_path;
    exception when others then null;
    end;
  end if;
  return old;
end
$$;
