# Project notes

## Live URLs

- **Public site:** https://event-crafted-co-web-git-main-canias7s-projects.vercel.app — this is THE URL for the public web app. All testing and verification happens here. Auto-redeploys on push to `main`.
- **Admin:** https://vendora-admin-henna.vercel.app — PIN-gated (`9236`) admin panel. Auto-redeploys on push to `main`.

Do NOT use `eventvendora.com` for testing — it's an old Lovable deployment that's no longer connected to this codebase. Do NOT use `event-crafted-co-web.vercel.app` either — Vercel redirects it to `eventvendora.com` because the latter is configured as the primary custom domain.

## Workflow preferences

- **Always merge to `main`** when finishing a feature branch. Don't suggest changing Vercel/CI production branches as a substitute — merge instead so `main` stays the source of truth and production deploys flow through it.
