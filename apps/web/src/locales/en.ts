import { toBundle } from "./bundle";

// Every English namespace. Bundled with the app: English is the default
// and the fallback.
export default toBundle(
  import.meta.glob<{ default: Record<string, unknown> }>("./en/*.json", { eager: true }),
);
