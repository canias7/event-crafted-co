import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// One-shot orphan cleaner for vendor-gallery. Lists every file
// under the user's folder via the storage REST API, cross-checks
// against vendor_gallery_images, and removes the ones with no app
// reference. Idempotent and bounded to the user's own folder.

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }
  const { user_id } = (await req.json().catch(() => ({}))) as { user_id?: string };
  if (!user_id) {
    return new Response(JSON.stringify({ error: 'user_id required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  // List the user's folder in vendor-gallery. Pagination loops until
  // we get a short page.
  const allNames: string[] = [];
  const PAGE_LIMIT = 1000;
  let offset = 0;
  // safety stop — should never be needed but bounds the loop
  for (let i = 0; i < 50; i++) {
    const { data, error } = await supabase.storage
      .from('vendor-gallery')
      .list(user_id, { limit: PAGE_LIMIT, offset });
    if (error) {
      return new Response(
        JSON.stringify({ error: 'list_failed', detail: error.message }),
        { status: 500, headers: { 'content-type': 'application/json' } },
      );
    }
    const batch = (data ?? []).map((f) => `${user_id}/${f.name}`);
    allNames.push(...batch);
    if (!data || data.length < PAGE_LIMIT) break;
    offset += PAGE_LIMIT;
  }

  const { data: live, error: liveErr } = await supabase
    .from('vendor_gallery_images')
    .select('image_url')
    .eq('user_id', user_id);
  if (liveErr) {
    return new Response(
      JSON.stringify({ error: 'live_check_failed', detail: liveErr.message }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }

  const liveSet = new Set(
    (live ?? [])
      .map((r) => String(r.image_url ?? '').split('/vendor-gallery/').pop() ?? '')
      .filter(Boolean),
  );
  const orphans = allNames.filter((n) => !liveSet.has(n));
  if (orphans.length === 0) {
    return new Response(
      JSON.stringify({ deleted: 0, scanned: allNames.length }),
      { headers: { 'content-type': 'application/json' } },
    );
  }

  const { error: rmErr } = await supabase.storage
    .from('vendor-gallery')
    .remove(orphans);
  if (rmErr) {
    return new Response(
      JSON.stringify({ error: 'remove_failed', detail: rmErr.message }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }

  return new Response(
    JSON.stringify({ deleted: orphans.length, scanned: allNames.length }),
    { headers: { 'content-type': 'application/json' } },
  );
});
