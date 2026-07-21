# Migrating web + admin from Vercel to Cloudflare Pages

Both `apps/web` (public site) and `apps/admin` (admin panel) are plain Vite
React SPAs. This moves their hosting from Vercel to **Cloudflare Pages**,
deployed by GitHub Actions via Wrangler (`.github/workflows/cloudflare-pages.yml`).

Mobile apps (`*-mobile`) are unaffected — they ship through EAS, not Vercel.

## What changed in the repo

| Vercel | Cloudflare equivalent |
|--------|-----------------------|
| `apps/web/vercel.json` rewrites/headers | `apps/web/public/_redirects` + `apps/web/public/_headers` |
| `apps/web/api/render.ts` (Edge Function) | `apps/web/functions/s/[slug].ts` (Pages Function) |
| `apps/admin/vercel.json` | `apps/admin/public/_redirects` + `apps/admin/public/_headers` |
| Vercel Git auto-deploy | `.github/workflows/cloudflare-pages.yml` (Wrangler) |
| `apps/web/wrangler.toml`, `apps/admin/wrangler.toml` | Pages project config (name + build output dir) |

The `/s/<slug>` route still works identically: the Pages Function renders the
public event page server-side on hard loads / for crawlers, while the SPA's
client-side React route handles in-app navigation. The old `vercel.json` and
`api/render.ts` are left in place as rollback references — Cloudflare only
deploys the `dist/` output, so they are inert.

## One-time Cloudflare setup (operator)

1. **Account ID** — Cloudflare dashboard → *Workers & Pages* → copy the
   Account ID from the sidebar.
2. **API token** — https://dash.cloudflare.com/profile/api-tokens →
   *Create Custom Token* → permission **Account · Cloudflare Pages · Edit**,
   scoped to your account. Copy it.
3. **Create the two Pages projects** — *Workers & Pages* → *Create* → *Pages*
   → *Upload assets* (direct-upload type). Name them exactly:
   - `vendora-web`
   - `vendora-admin`
4. **GitHub secrets** — repo *Settings → Secrets and variables → Actions*:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`

   Optional overrides (public defaults are baked into the workflow otherwise):
   `VITE_STRIPE_PUBLISHABLE_KEY` (set the `pk_live_...` key for production),
   `VITE_SENTRY_DSN`, `VITE_ADMIN_EMAIL`.

## First deploy

Run the workflow manually (Actions → *Deploy to Cloudflare Pages* → *Run
workflow*) or push a change under `apps/web/**` / `apps/admin/**` to `main`.
Each Pages project gets a `*.pages.dev` preview URL — verify both, especially:
- web: load `/s/<a-known-slug>` and confirm the event page renders (not raw
  source) and that a deep link like `/dashboard` returns the SPA (not a 404).
- admin: confirm the PIN gate loads and the `noindex` header is present.

## DNS cutover (do last)

1. Add `eventvendora.com` as a site in Cloudflare and point the registrar's
   nameservers at the two Cloudflare NS records.
2. Under **vendora-web** → *Custom domains*, add `eventvendora.com` and
   `app.eventvendora.com`.
3. Under **vendora-admin** → *Custom domains*, add `admin.eventvendora.com`.
4. Once traffic is served by Cloudflare and verified, remove the domains from
   the Vercel projects. The `vercel.json` files and `apps/web/api/render.ts`
   can then be deleted in a cleanup PR.
