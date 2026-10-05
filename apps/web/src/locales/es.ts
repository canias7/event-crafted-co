import { toBundle } from "./bundle";

// Every Spanish namespace, as one chunk that i18n.ts fetches the first
// time someone reads the site in Spanish.
export default toBundle(
  import.meta.glob<{ default: Record<string, unknown> }>("./es/*.json", { eager: true }),
);
