# @vendora/ads — Eventvendora ad studio

A [Remotion](https://www.remotion.dev) project for making **animated + video ads**
for Eventvendora, on your own machine. Write ads as React, preview them live, and
render real `.mp4` files for Instagram, TikTok, YouTube, etc.

This is a **local-only** tool — it is not deployed and not imported by the web/admin
apps.

## Quick start

```bash
cd apps/ads
npm install          # if deps aren't already hoisted by the monorepo
npm run studio       # opens the Remotion Studio in your browser
```

In the Studio you can scrub the timeline, tweak the ad text live (right-hand
**Props** panel), and preview every format.

## Render to video

```bash
npm run render:square   # 1080x1080  -> out/square-promo.mp4   (IG / FB feed)
npm run render:story    # 1080x1920  -> out/story-promo.mp4    (Reels / TikTok)
npm run render:lottie   # Lottie demo -> out/lottie-demo.mp4
npm run still           # single frame -> out/poster.png
```

Or render any composition manually:

```bash
npx remotion render <CompositionId> out/my-ad.mp4
```

## What's inside

| File | What it is |
| --- | --- |
| `src/Root.tsx` | Registers the compositions (the formats you can render). |
| `src/compositions/Promo.tsx` | The main animated promo ad (square + story). Edit text via `defaultProps` or the Studio Props panel. |
| `src/compositions/LottieDemo.tsx` | Shows how to play a Lottie animation in a video. |
| `src/components/Background.tsx` | The branded navy animated backdrop. |
| `src/theme.ts` | Brand colors + fonts (navy / crimson, Bodoni serif). |
| `public/animation.json` | The Lottie file used by `LottieDemo`. Swap it for any file from [LottieFiles](https://lottiefiles.com). |

## Customising

- **Change the copy:** edit `promoDefaultProps` in `src/compositions/Promo.tsx`,
  or just type new text in the Studio's Props panel and re-render.
- **New ad format/size:** add another `<Composition>` in `src/Root.tsx`.
- **Use a real Lottie animation:** download "Lottie JSON" from LottieFiles, save it
  as `public/animation.json` (or add your own and update the path in `LottieDemo.tsx`).
- **Real Satoshi font:** drop the `.woff2` files in `public/` and load them with
  `@remotion/fonts`. Right now the brand sans falls back to Inter.

## Notes

- React is pinned to 19.2.0 to match the monorepo root override.
- First `studio`/`render` downloads a headless Chromium for Remotion — that's normal.
