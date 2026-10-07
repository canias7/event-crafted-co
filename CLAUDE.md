# Project notes

## Live URLs

- **Public site:** https://eventvendora.com (and https://app.eventvendora.com) — both serve the same **Cloudflare Pages** deployment of `apps/web`, deployed by `.github/workflows/cloudflare-pages.yml` on push to `main`. Routing and cache headers live in `apps/web/public/_redirects` / `_headers`.
- **Admin:** https://admin.eventvendora.com — PIN-gated (`9236`) admin panel from `apps/admin`, also on Cloudflare Pages via the same workflow (headers in `apps/admin/public/_headers`).
- https://vendora-admin-henna.vercel.app still answers from an older Vercel project. The `vercel.json` files only apply to those leftover Vercel projects, not to the live sites.

DNS for `eventvendora.com` moved off Lovable (then Vercel) and onto Cloudflare.

## What Claude has access to

Future-Claude reading this: yes, you DO have integration tokens. Don't gaslight yourself when the user says "you have access tokens" — they're right. Inventory:

- **GitHub MCP** (full repo read/write). Used for: commits, branches, files, PRs (create / read / merge / update), issues, releases. Whenever the user says "merge to main" or "push the PR," use the MCP tools — do not refuse for lack of `gh` CLI. The MCP integration is auth'd.
- **Supabase MCP** (project `pahpjjubhbcbwqjpamwv`). Used for: `execute_sql`, `apply_migration`, `deploy_edge_function`, `list_tables`, `get_advisors`, `get_logs`, etc. Full DB + edge function control.
- **Git push to remote** via local proxy at `127.0.0.1:<port>/git/canias7/event-crafted-co`. Lets you `git push -u origin <branch>` directly.

Supabase MCP caveat: DDL and other destructive SQL (`drop`, `alter`) through `apply_migration` / `execute_sql` can hang for 60s and time out in a cloud session (it waits on a confirmation that never shows). Reads and plain `select` calls work. For production schema changes, Auth config changes and deleting deployed functions, use `.github/workflows/supabase-ops.yml`: list the work in `supabase/ops/` and merge to `main` (see `supabase/ops/README.md`).

What Claude does NOT have direct shell access to:

- **`EXPO_TOKEN`** — lives only as a GitHub Actions repo secret, readable by the `mobile-ota.yml` workflow when it runs. Not in the shell env (deliberately — same model as Vercel deploy tokens). To OTA mobile apps, push a `trigger-ota/*` branch and the workflow uses the secret. Do not loop "where is the token" — it's NOT in `~/.expo`, `~/.config/eas-cli*`, env vars, or any dotfile. The trigger-branch CI dance IS the access path.
- **`eas login` session** — sandbox can't `eas login`. The CLI is installed but unauth'd. Use the trigger-branch path below.
- **`RESEND_API_KEY`** — Supabase Edge Functions secret, set via Supabase dashboard. Not in shell. Operator action to set.

## Workflow preferences

- **Always merge to `main`** when finishing a feature branch. Don't suggest changing Cloudflare/CI production branches as a substitute — merge instead so `main` stays the source of truth and production deploys flow through it. Use `mcp__github__create_pull_request` + `mcp__github__merge_pull_request`.

- **Page walkthrough list.** The owner reviews the design page by page from the doc "Vendora pages — design walkthrough" (https://claude.ai/code/artifact/123e1786-6ad2-4a4d-a055-343b7d25c3d1): every website and admin page with its link and a Status dropdown. When a change adds, removes or renames a page (a route in `apps/web/src/App.tsx` or `apps/admin/src/App.tsx`), update that doc in the same piece of work: add, remove or rename the row. Leave the owner's Status values alone.

- **Site photos (owner's call, Oct 2026).** The website uses only the owner's pictures: `apps/web/src/assets/photos/NN.webp`, numbered as in the "Photos" tab of the walkthrough doc (picture 9 was dropped). Don't add stock or other photos. Spread them so a picture doesn't repeat on pages that lead into each other, and match each slot's category. If you can't tell what a picture shows, ask; if a category runs out of pictures, tell the owner rather than repeating. When a page's picture changes, update the Photos tab ("Where it's used").

- **Directions to a page.** When the owner asks how to get to a page, answer with the clicks from the home page (or the signed-in home), e.g. "footer → Company → Press". Check them against the current nav, footer and sidebars rather than from memory.

- **`bunx expo install` writes to the ROOT `package.json`**, not the app's, even when run from inside `apps/<app>-mobile`. If you add packages to render an app headlessly (react-native-web, react-dom, @expo/metro-runtime), reverting `apps/<app>-mobile/package.json` does NOT undo it — check `git status` at the repo root before committing. Leaving them in desyncs `bun.lock`, and every OTA then dies on `bun install --frozen-lockfile` with "lockfile had changes, but lockfile is frozen".

## Brand system (locked with the owner, Oct 2026)

Applies to the website (`apps/web`) and both apps. Use these tokens and rules; don't introduce new colours, fonts or styles. If something doesn't fit, ask the owner.

**Colours**

| Role | Value | Web token | App constant |
|---|---|---|---|
| Ink: all text, "done" pills | `#14161a` | `foreground`, `primary`, `muted-foreground` | `INK`, `INK_DIM` |
| Ivory page | `#f4f1ea` | `background` (`#f4f2eb`) | `PAGE` / `CREAM` |
| Cream card, fields | `#fbf9f4` | `card` | `CARD` / `INPUT_BG` |
| Surface: chips, neutral pills | `#ece7db` | `muted`, `secondary` | `SURFACE` / `CREAM_DEEP` |
| Hairline border | `#e6e1d5` | `border` | `BORDER` |
| Bronze: gold *text* on light | `#8a6f3e` | `accent` | `BRONZE` |
| Champagne: ornament, fills, unread dots, gold on dark | `#c9a86a` | `gold` | `GOLD` |
| Gold tint: "waiting" | `#f2e7cb` | `pending` | `PENDING_BG` |
| Red: errors, delete, problems | `#b23a34` | `destructive` | `ERROR` |
| Placeholder text | `#746a58` | `placeholder` (a base rule covers bare inputs) | `PLACEHOLDER` / `SUBTLE` |

- **No grey text.** Text is ink or bronze. Don't use Tailwind palette colours (`slate`, `zinc`, `gray`, `emerald`, `rose`, `sky`…) or one-off hexes. Grey icons are fine.
- **Status language:** done = ink pill (`bg-primary text-primary-foreground`), waiting = bronze on gold tint (`bg-pending text-accent`), problem = red on its tint (`bg-destructive/10 text-destructive`), neutral = `bg-muted text-foreground`. Lead temperature: hot red, warm gold, cold neutral. Verified marks are bronze. Money in is bronze, money out ink.
- **Links hover to bronze** (`hover:text-accent`), never `hover:text-foreground`, which changes nothing now that text is ink.
- **Green is only for live signals:** online and "active now" dots, the status page's "operational". The green "Active now" text in both apps stays (owner's call).
- Fields on dark surfaces keep a light placeholder.

**Fonts**

- **Libre Baskerville for all text** (headlines, body, labels, buttons, tables) on the website and in both apps. No Inter or other faces. The only exceptions are the signature script and monospace code.
- **Titles are bold and upright**: on the web, h1–h6, `font-editorial` and `font-display`; in the apps, `SERIF_BOLD`. Highlighted words in a title are upright too (just `text-accent`).
- **Italic is only for** quotes, bios, captions and state notes like "message deleted", at regular weight (`font-serif italic` / `SERIF_ITALIC`).
- Labels and buttons are bold. Baskerville only has 400 and 700, plus 400 italic, so `font-medium` renders as regular and `font-semibold` as bold.
- `.font-editorial` is a custom utility, emitted after Tailwind's core utilities. It beats `not-italic`/`font-normal` on the same element, so don't combine them expecting the core class to win.
- The logo wordmark (`VendoraLogo`) is italic regular. Leave it.
- **Top-left logo (owner's call):** every page shows the full lockup, "vendora" plus EVENTS, SIMPLIFIED, in the same spot: the page container's edge, 20px down on phones and 28px from tablet up. Public pages get it from `PublicNav` (any tone; its desktop links show from 1024px, the menu button below), sign-in pages from `AuthTopBar`. Don't give a page its own header or logo. The tagline is champagne on dark and bronze on light; the portal sidebar uses the small size so it fits.

**Components** (same standard on the website and in both apps; app tokens live in each app's `lib/ui.ts`)

- **Buttons are pills** with a bold label, 36 / 44 / 52 tall (web `size="sm"` / default / `"lg"`; apps `BUTTON_HEIGHT`).
  - Primary: champagne fill, ink label. Hover is a step darker (`gold-hover`). Disabled is solid `#e0d2b0` (`gold-muted` / `GOLD_MUTED`) with the label still ink; never fade a button with opacity.
  - Secondary: white, 1px hairline, ink label. Quiet: the label alone. Danger: red fill, white label, for confirming a destructive action; entry points such as "Delete account" stay quiet with a red label.
  - Ink is never a button fill. It means selected (active tab, chip, day or segment: ink fill, white label; selected tile: 1px ink border) or done, and it stays on avatars, outgoing bubbles, tooltips, dark summary cards and icon-only buttons (send, play).
- **Cards are flat:** cream fill, 1px hairline, 20px corners, no shadow, padding 16 on phones and 24 on desktop. Clickable cards darken their border on hover; nothing lifts. No glass or backdrop blur on cards (blur is only for sticky headers and overlays).
- **Corners:** 8 tags, 12 inputs/tiles/menus, 20 cards, 24 modals and sheets, full pill for buttons, chips and status pills. Web: `rounded-md`, `rounded-lg`/`xl`, `rounded-2xl`, `rounded-3xl`, `rounded-full`; apps: `RADIUS`. Leave circles as circles.
- **Borders** are 1px: the one hairline (`border-border` / `BORDER`), ink for selected, white at 15% on dark.
- **Two shadows only:** soft for menus, popovers, toasts and sticky or floating bars; lifted for modals and sheets (web `shadow-soft` / `shadow-lifted`, apps `...SHADOW.soft` / `...SHADOW.lifted`).
- **Spacing:** anything 12 or more sits on the 4px grid. Page edge is 20px on phones and 32px from tablet up (web `px-5 md:px-8`; `.container` defaults to the same). 12 between stacked cards, 24 to 32 between sections.
- **Inputs:** white, 1px hairline, 12px corners, 44px tall on the web.

**Public pages are dark** (owner's call, Oct 2026): home, vendors, By location, Explore, How it works, For hosts / For vendors, Help, Status, Press, Changelog, Privacy and Terms. The city, category and vendor profile pages are still light; the owner is reviewing pages one by one.
- Ink page (`style={{ backgroundColor: "#14161a" }}`) with cream text (`text-[#f4f1ea]`, `/80` for secondary).
- Champagne for labels, links and accents (`text-gold`, hover to white), never bronze on ink.
- White-at-15% hairlines; cards `border-white/15 bg-white/[0.03]`.
- `PublicNav tone="dark"` (or `"overlay"` over a photo) and `<Footer tone="dark" />`.
- The language switcher lives only in the footer's bottom bar, never in the nav (owner's call): any public page needs the footer so it has one.
- Pop-up menus stay light. The brand red is too faint on ink for text, so put it on a cream pill.
- Sign-in pages and the signed-in portals keep the light style for now.

**Deliberately different (don't "fix")**

- Sign-in area colours (`GlassyAuthShell`, `pages/auth`), pending a redesign.
- Proposal and invoice document palettes, media players' black backgrounds, and avatar colour palettes.
- The vendor app's calendar block mode marks picked days in gold, not ink, so they don't read as booked.

**When changing UI:** keep text at 4.5:1 contrast or better. Baskerville is wider than a sans, so check phone width (390px) for sideways overflow.

**Typechecking the apps:** `npx tsc --noEmit -p .` stops at the TS5101 `baseUrl` deprecation and never checks types. Run `npx tsc --noEmit -p . --ignoreDeprecations 6.0` and compare the error list with `main` (Oct 2026: vendor-mobile 47, host-mobile 19 existing errors, mostly unresolved `@expo/vector-icons` types).

## Website languages (English, Spanish, Russian)

The whole website (`apps/web`: public pages, sign-in, host and vendor portals) is in English, Spanish and Russian (Oct 2026). Any text you add or change needs all three.

- Strings live in `apps/web/src/locales/<language>/<namespace>.json` (`en/`, `es/`, `ru/`), loaded automatically by `src/i18n.ts`. Keep the files' keys identical, except Russian plurals: where English has `key_one`/`key_other`, Russian has `key_one`/`key_few`/`key_many`/`key_other`, each with `{{count}}`. Read them with `useTranslation("<namespace>")` (or `i18n.t(key, { ns })` outside components). A changelog entry needs its text in every `changelog.json`.
- English ships in the main bundle; Spanish and Russian are a chunk each (`src/locales/es.ts`, `ru.ts`), fetched only when someone reads the site in that language, and `main.tsx` renders after `i18nReady` so the first paint is already in it. To switch language in code, use `changeLanguage()` from `@/i18n`, which fetches the strings first. Adding a language: a `locales/<code>/` folder, a `locales/<code>.ts`, and entries in `LAZY_LANGUAGES`, `SUPPORTED_LANGUAGES` and `LANGUAGE_LABELS`.
- Spanish is neutral Latin American with "tú". Words: vendor = proveedor, host = anfitrión, listing = anuncio, inquiry = consulta, quote = cotización, proposal = propuesta, deposit = anticipo, dashboard = panel.
- Russian uses polite «вы» (lowercase), sentence case and «ёлочки» quotes. Words: vendor = подрядчик, host = организатор, listing = объявление, inquiry = заявка, quote = смета, proposal = предложение, contract = договор, invoice = счёт, deposit = предоплата, dashboard = панель, Explore = Обзор, venue = площадка, vendor application = анкета. Vendora, Pro and Premium stay in Latin letters and "Vendora" isn't declined («на Vendora»). Russian can't decline a business name or a city inside a sentence, so phrase around `{{name}}` («{{city}}: 12 подрядчиков»).
- Dates, times and numbers: pass `intlLocale()` from `@/lib/intlLocale` (US Spanish "7:05 p.m.", Russian "19:05", "5 окт. 2026 г."), never bare `i18n.language` ("es" gives "19:05" and "1234 US$"). Where English keeps its own format (the browser default, or a fixed "en-US"), use `siteLocaleOr(...)`. Money keeps the US format on the Russian site ($1,234.50, like listings, PDFs and Stripe receipts): `formatCents()` or `moneyLocale()`.
- Libre Baskerville has no Cyrillic letters, so Russian text shows in the fallback serif (Georgia on Apple and Windows, Noto Serif on Android). Don't add a font without asking the owner. Russian words run long and Noto Serif is wide: check a 360px phone, and use `min-w-0`, `shrink-0` and wrapping rather than fixed widths. Headlines in Russian hyphenate (`index.css`), and the page heroes and sign-in titles step down a size on phones.
- Category names: `useCategoryNames()`; prices and event types: `usePriceLabels()`. Values saved to the database, URLs and filters stay English.
- `<Trans>` tags must not be named after HTML void elements (`link`, `br`, `img`, `input`, `hr`…): use `<helpLink>`, `<gold>` and so on.
- Tailwind's `capitalize` is switched off in every language but English (`index.css`), since Spanish and Russian use sentence case; write their labels in sentence case.
- Stays English on purpose: what vendors and hosts typed, chat messages the site writes on someone's behalf, contract/invoice PDFs, server emails, the mobile apps and the admin panel. (The signed-contract PDF from the sign page has Spanish labels in Spanish but English in Russian: jsPDF's built-in fonts have no Cyrillic.)

## Mobile apps (host-mobile + vendor-mobile)

**Cross-platform by default**: any mobile change applies to BOTH iOS and Android unless explicitly stated otherwise. JS code (components, styles, business logic) runs identically on both via React Native, so the same edit covers both platforms. For full rebuilds, run iOS *and* Android.

### OTA + builds

Both apps have `expo-updates` wired up, so JS-only changes ship via OTA instead of a full rebuild:

- **JS-only change** (components, styling, copy, business logic) → `cd apps/<app>-mobile && eas update --branch production --message "..."`. Picks up on next launch.
- **Native change** (new package with native code, `Info.plist`, app icon, splash) → bump `runtimeVersion` in `app.json` and rebuild via `eas build --platform all --profile production --auto-submit`.

`runtimeVersion` is a **fixed string** per app (vendor-mobile `"2"`, host-mobile `"1"`) — NOT `{ policy: "appVersion" }`. The appVersion policy caused OTAs to silently target a runtimeVersion that no installed app was running, since bumping `version` to cut a new build also bumped the runtime. With a fixed string, OTA reaches every install until you intentionally bump the string.

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

Watch the run at https://github.com/canias7/event-crafted-co/actions. After it completes, the trigger branch can be deleted. Claude's git credential can't delete branches (or push tags), so ask the owner to delete it.

Workflow_dispatch is also available (lets you pick `vendor` / `host` / `both` explicitly) but no MCP tool currently invokes it — so push-trigger with the default override is the path.

EAS project IDs:
- vendor-mobile: `8a56059c-321e-4de3-938e-3e82904803c1` (App Store ID 6767470298, bundle `co.eventcrafted.vendor`)
- host-mobile: `78809059-f3b6-451b-a5c1-5cae58abe87a` (App Store ID 6767471797, bundle `co.eventcrafted.host`)
