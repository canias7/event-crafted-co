# Project notes

## Live URLs

- **Public site:** https://eventvendora.com (and https://app.eventvendora.com) — both serve the same Vercel deployment from `apps/web`. These are THE URLs for the public web app. Auto-redeploy on push to `main`.
- **Admin:** https://admin.eventvendora.com (and https://vendora-admin-henna.vercel.app) — PIN-gated (`9236`) admin panel from `apps/admin`. Auto-redeploys on push to `main`.

The DNS for `eventvendora.com` and `app.eventvendora.com` was migrated off Lovable and onto Vercel. Old Lovable host is no longer in the picture.

## Workflow preferences

- **Always merge to `main`** when finishing a feature branch. Don't suggest changing Vercel/CI production branches as a substitute — merge instead so `main` stays the source of truth and production deploys flow through it.

## Mobile apps (host-mobile + vendor-mobile)

**Cross-platform by default**: any mobile change applies to BOTH iOS and Android unless explicitly stated otherwise. JS code (components, styles, business logic) runs identically on both via React Native, so the same edit covers both platforms. For full rebuilds, run iOS *and* Android.

Both apps have `expo-updates` wired up, so JS-only changes ship via OTA instead of a full rebuild:

- **JS-only change** (components, styling, copy, business logic) → `cd apps/<app>-mobile && eas update --branch production --message "..."`. By default this pushes to iOS + Android together. Installed builds with the same `runtimeVersion` (tied to app version) pick it up on next launch.
- **Native change** (new package with native code, `Info.plist`, app icon, splash, version bump) → break the runtime version → rebuild via `eas build --platform all --profile production --auto-submit` (or `--platform ios` / `--platform android` separately if you only need one).

### OTA from a cloud / sandbox session (no `eas login`)

The sandbox Claude runs in does NOT have an EAS session. Don't try `eas update` here — it'll fail with "An Expo user account is required to proceed."

Use the GitHub Actions workflow at `.github/workflows/mobile-ota.yml` instead. It runs the same `eas update` with the `EXPO_TOKEN` repo secret already configured.

To trigger it from a Claude session: push the working branch to a name starting with `trigger-ota/`. The push-trigger of this workflow defaults to `vendor` only — to OTA both apps in one shot, change the `APPS_INPUT="${INPUT_APPS:-vendor}"` default to `both` on the trigger branch BEFORE pushing.

```bash
git checkout -b trigger-ota/<short-tag>
# edit .github/workflows/mobile-ota.yml line ~42 to: APPS_INPUT="${INPUT_APPS:-both}"
git commit -am "Trigger OTA: both apps"
git push -u origin trigger-ota/<short-tag>
```

Watch the run at https://github.com/canias7/event-crafted-co/actions. After it completes, you can delete the trigger branch.

Workflow_dispatch is also available (lets you pick `vendor` / `host` / `both` explicitly) but no MCP tool currently invokes it — so push-trigger with the default override is the path.

EAS project IDs:
- vendor-mobile: `8a56059c-321e-4de3-938e-3e82904803c1` (App Store ID 6767470298, bundle `co.eventcrafted.vendor`)
- host-mobile: `78809059-f3b6-451b-a5c1-5cae58abe87a` (App Store ID 6767471797, bundle `co.eventcrafted.host`)
