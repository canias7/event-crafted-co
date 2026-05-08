# Project notes

## Live URLs

- **Public site:** https://eventvendora.com (and https://app.eventvendora.com) — both serve the same Vercel deployment from `apps/web`. These are THE URLs for the public web app. Auto-redeploy on push to `main`.
- **Admin:** https://admin.eventvendora.com (and https://vendora-admin-henna.vercel.app) — PIN-gated (`9236`) admin panel from `apps/admin`. Auto-redeploys on push to `main`.

The DNS for `eventvendora.com` and `app.eventvendora.com` was migrated off Lovable and onto Vercel. Old Lovable host is no longer in the picture.

## Workflow preferences

- **Always merge to `main`** when finishing a feature branch. Don't suggest changing Vercel/CI production branches as a substitute — merge instead so `main` stays the source of truth and production deploys flow through it.

## Mobile apps (host-mobile + vendor-mobile)

Both apps have `expo-updates` wired up, so JS-only changes ship via OTA instead of a full rebuild:

- **JS-only change** (components, styling, copy, business logic) → `cd apps/<app>-mobile && eas update --branch production --message "..."`. Installed TestFlight + production builds with the same `runtimeVersion` (tied to app version) pick it up on next launch.
- **Native change** (new package with native code, `Info.plist`, app icon, splash, version bump) → break the runtime version → need `eas build --platform ios --profile production --auto-submit` again. Same for Android (`--platform android`).

EAS project IDs:
- vendor-mobile: `8a56059c-321e-4de3-938e-3e82904803c1` (App Store ID 6767470298, bundle `co.eventcrafted.vendor`)
- host-mobile: `78809059-f3b6-451b-a5c1-5cae58abe87a` (App Store ID 6767471797, bundle `co.eventcrafted.host`)
