# Project notes

## Live URLs

- **Public site:** https://eventvendora.com (and https://app.eventvendora.com) — both serve the same Vercel deployment from `apps/web`. These are THE URLs for the public web app. Auto-redeploy on push to `main`.
- **Admin:** https://vendora-admin-henna.vercel.app — PIN-gated (`9236`) admin panel from `apps/admin`. Auto-redeploys on push to `main`.

The DNS for `eventvendora.com` and `app.eventvendora.com` was migrated off Lovable and onto Vercel. Old Lovable host is no longer in the picture.

## Workflow preferences

- **Always merge to `main`** when finishing a feature branch. Don't suggest changing Vercel/CI production branches as a substitute — merge instead so `main` stays the source of truth and production deploys flow through it.
