
-- Lock down listing on public buckets: keep public read of individual objects,
-- but require auth to enumerate bucket contents.
DO $$
DECLARE
  b text;
BEGIN
  FOR b IN SELECT unnest(ARRAY[
    'vendor-portfolios',
    'message-attachments',
    'mood-board-images',
    'review-photos',
    'vendor-showcase-clips'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'public_list_' || b);
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'auth_list_' || b);
    EXECUTE format($f$
      CREATE POLICY %I ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = %L)
    $f$, 'auth_list_' || b, b);
  END LOOP;
END $$;
