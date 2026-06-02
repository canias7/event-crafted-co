import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// Authenticated storage-state file. Shared by playwright.config.ts (which
// must NOT import the test-registering auth.setup.ts) and auth.setup.ts.
export const VENDOR_AUTH_FILE = path.join(here, ".auth/vendor.json");
