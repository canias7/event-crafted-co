# Migrating native builds from EAS → GitHub Actions

**Scope:** This migration replaces `eas build` (the paid Expo build service)
with GitHub Actions runners. The Expo SDK and EAS Update (OTA delivery)
stay exactly as they are — your app code doesn't change. Only WHERE the
.ipa / .aab gets compiled changes.

**Why:** Public repos get free unlimited GitHub Actions minutes,
including macOS runners. EAS Production is $19/mo; this is $0/mo.

**Trade-off:** You take over Apple cert management + Android keystore
management. EAS used to auto-rotate / auto-renew these for you.

---

## What you do once (one-time setup)

### 1. Generate your secrets

#### a) iOS cert + provisioning profile

Two options:

**Option A — pull from EAS** (easiest if you already have an EAS-managed cert)

```bash
cd apps/host-mobile
eas credentials
# → Select iOS → Production → "Download Distribution Certificate"
#    saves a .p12 file + tells you the password
# → "Download Provisioning Profile"
#    saves a .mobileprovision file

# Repeat for vendor-mobile
cd ../vendor-mobile
eas credentials
```

**Option B — generate fresh** (Apple Developer portal)

```
developer.apple.com → Certificates → Create → iOS Distribution
                   → download .cer → import to Keychain → export as .p12

developer.apple.com → Profiles → Create → App Store
                   → select the dist cert → download .mobileprovision
```

Then base64 the files so they fit in GH secrets:

```bash
base64 -i cert.p12 | tr -d '\n'        # → IOS_CERT_P12_BASE64
base64 -i profile.mobileprovision | tr -d '\n'   # → IOS_PROVISIONING_PROFILE_BASE64
```

#### b) App Store Connect API key

For TestFlight upload (replaces `eas submit`):

```
appstoreconnect.apple.com → Users and Access → Integrations
                          → Team Keys → Generate API Key
                          → Access: "App Manager"
                          → Download .p8 (you can only download ONCE)
                          → note the Key ID + Issuer ID shown on the page
```

```bash
base64 -i AuthKey_XXXXXXXX.p8 | tr -d '\n'   # → ASC_API_KEY_BASE64
```

#### c) Android keystore

```bash
cd apps/host-mobile
eas credentials
# → Select Android → Production → "Download Keystore"
#    saves a .jks file + shows you keystore password + key alias + key password

base64 -i keystore.jks | tr -d '\n'   # → ANDROID_KEYSTORE_BASE64
```

Repeat for vendor-mobile (each app has its own keystore).

#### d) Google Play service account

For Play Console upload (replaces `eas submit` for Android):

```
console.cloud.google.com → IAM & Admin → Service Accounts → Create
                         → grant "Service Account User" role
                         → Keys tab → Add Key → JSON → downloads .json

play.google.com/console → Setup → API access → Link existing service account
                       → grant "Release manager" permission
```

The downloaded JSON file goes in as `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`
(paste the whole JSON text, no base64 needed).

### 2. Upload all secrets

```
github.com/canias7/event-crafted-co → Settings → Secrets and variables
                                    → Actions → New repository secret
```

**iOS** (one set, shared by host + vendor builds — assumes same Apple Team):
- `IOS_CERT_P12_BASE64`
- `IOS_CERT_PASSWORD`
- `IOS_PROVISIONING_PROFILE_BASE64`
- `IOS_KEYCHAIN_PASSWORD` (any random string — used for the
  ephemeral keychain on the runner; I suggest `openssl rand -base64 16`)
- `ASC_API_KEY_ID` (10-character string)
- `ASC_API_KEY_ISSUER_ID` (UUID)
- `ASC_API_KEY_BASE64`

⚠️ **If host-mobile and vendor-mobile have different provisioning profiles** (likely — each app has its own bundle ID + profile), you'll need to add per-app variants:
- `IOS_PROVISIONING_PROFILE_HOST_BASE64`
- `IOS_PROVISIONING_PROFILE_VENDOR_BASE64`

And update `build-ios.yml` to pick the right one based on `inputs.app`. Tell me and I'll patch.

**Android** (per-app):
- `ANDROID_KEYSTORE_HOST_BASE64`
- `ANDROID_KEYSTORE_VENDOR_BASE64`
- `ANDROID_KEYSTORE_PASSWORD` (same across both, usually)
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`

⚠️ Same caveat — if the keystores actually differ between apps, the workflow needs a per-app selector. Tell me which version you have once you've pulled from EAS.

### 3. Test once per platform

```
github.com/canias7/event-crafted-co/actions
  → Build iOS (native) → Run workflow → app: host → submit: false (first time)
  → wait ~25 min → download the .ipa from workflow artifacts → verify

  → Build Android (native) → same drill
```

After both succeed → flip `submit: true` and let them upload to TestFlight / Play Internal directly.

### 4. Disable / archive the EAS Build workflow

Once the new workflows are working:

```bash
# Optional — keep the YAML file as a fallback, just don't run it
mv .github/workflows/mobile-build.yml .github/workflows/mobile-build.yml.disabled
```

You can stop paying for EAS Production at this point (if you were).
Keep using EAS Update on the free tier (1k MAU cap) until/unless that
becomes a constraint.

---

## What stays unchanged

- `apps/*-mobile/app.json` — `updates.url`, `runtimeVersion`, everything stays the same
- `mobile-ota.yml` — keeps publishing OTAs through EAS Update CDN
- `expo-updates` package in your app — unchanged
- All `expo-*` SDK packages — unchanged
- Your Expo account — still needed for EAS Update (free tier is fine)

---

## Recurring costs after switch

- GitHub Actions: **$0** (public repo, unlimited minutes)
- EAS Free tier: **$0** (covers up to 1,000 MAU of OTA bandwidth)
- Apple Developer: **$99/year** (unchanged — required regardless of platform)
- Google Play: **$25 once** (unchanged — paid years ago, presumably)
- Cloudflare: **$0** (not using; kept EAS Update)

**Total recurring: $99/year (Apple only).** Compared to your current
spend if you're on EAS Production ($228/year), this saves **$129/year**.

If/when you grow past 1k MAU and need EAS Update Production
(100k MAU), the EAS bill comes back at $19/mo. That's a problem worth
having.

---

## Known gotchas

- **First iOS build will probably fail** on signing config. The
  ExportOptions.plist in the workflow assumes manual signing with
  TeamID `MY8LTVJQ82` (already hardcoded from your `eas.json`). If
  Apple rotates anything, you'll get a "no profile for bundle id"
  error and need to regenerate.

- **`apple-actions/import-codesign-certs@v3`** is a third-party
  GitHub Action — vet it before relying on it, or replace with raw
  `security import` commands.

- **`r0adkll/upload-google-play@v1`** (Android upload action) — also
  third-party but widely used.

- **macOS runners get deprecated periodically.** `macos-latest`
  currently → macOS 15. When GH rolls to macOS 16, your Xcode version
  will jump too. Expo SDK 55 needs Xcode ≥ 16, so this is fine for
  now; just be aware.
