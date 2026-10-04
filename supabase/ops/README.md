# One-shot production ops

`.github/workflows/supabase-ops.yml` applies what's listed here to the
production project when a change to this folder (or the workflow) lands on
`main`. Every step is idempotent, so a re-run is harmless.

- `auth-config.json` — fields PATCHed onto the project's Auth config via the
  Management API.
- `auth-config-optional.json` — same, but a failure doesn't stop the run
  (leaked-password protection needs a paid plan).
- `apply-migrations.txt` — migration files (under `supabase/migrations/`) to
  run once. A file is skipped if its version is already recorded in
  `supabase_migrations.schema_migrations`; after a successful run its version
  is recorded.
- `retired-functions.txt` — deployed edge functions to delete. Missing ones
  are skipped.

Uses the `SUPABASETOKEN` repo secret, the same one the edge-function deploy
uses.
