-- The web app writes message-attachments as
-- { storage_path, filename, size, mime }; the mobile apps write as
-- { url, kind }. The cleanup trigger was reading the 'url' key only,
-- so every web-originated attachment leaked in storage on hard-
-- delete of its parent direct_messages row. (Soft-delete via the UI
-- doesn't trigger this path, but cascading thread deletes do.)
--
-- New shape: prefer storage_path when present, fall back to deriving
-- it from the public URL for legacy mobile-written attachments.

create or replace function public.tg_direct_message_storage_cleanup()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    delete from storage.objects
      where bucket_id = 'message-attachments' and name = v_path;
  end loop;
  return old;
end
$function$;
