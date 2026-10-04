import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// Storage-state files hold live tokens: git-ignored, and the workflow deletes
// this directory before uploading artifacts.
export const CANARY_AUTH_DIR = path.join(here, ".auth");
export const CANARY_VENDOR_STATE = path.join(CANARY_AUTH_DIR, "vendor.json");
export const CANARY_HOST_STATE = path.join(CANARY_AUTH_DIR, "host.json");

// Everything the workflow publishes lives under here.
export const RESULTS_DIR = path.resolve(here, "../../canary-results");
