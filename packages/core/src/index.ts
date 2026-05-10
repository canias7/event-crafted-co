// Shared business logic surface for the web app and the two Expo
// mobile apps. Anything that's purely data / pure logic / type
// definitions lives here so it has one source of truth across all
// three apps. Anything platform-specific (DOM listeners, RN APIs,
// Vite asset imports, NativeWind styles) stays in the consuming app.
//
// To add a shared piece:
//   1. Drop the source file under packages/core/src/<area>/
//   2. Re-export the public surface here so both apps see the same
//      import path: `import { formatCents } from "@vendora/core"`.

export * from "./types";
export * from "./lib/format";
export * from "./lib/categoryTaxonomy";
export * from "./lib/categoryAttributes";
