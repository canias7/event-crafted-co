import { toBundle } from "./bundle";

// Every Russian namespace, as one chunk that i18n.ts fetches the first
// time someone reads the site in Russian.
export default toBundle(
  import.meta.glob<{ default: Record<string, unknown> }>("./ru/*.json", { eager: true }),
);
