// Metro config for monorepo support. Without this, Metro only watches
// the app directory and won't pick up changes to packages/core or
// resolve modules hoisted to the workspace root.
//
// blockList: since we watch the entire monorepo, Metro's expo-router
// route discovery (via require.context on the project's `app/`)
// accidentally pulls in OTHER apps' `app/` directories — host-mobile,
// admin, web — and those use the same `@/` alias pointing at their
// own roots, so vendor-mobile's tsconfig-paths resolver throws on
// "Unable to resolve module @/components/InquiryComposer from
// apps/host-mobile/app/(host)/vendor/[id].tsx". Block them outright.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch the entire monorepo so edits in packages/core hot-reload.
config.watchFolders = [monorepoRoot];

// Resolve modules from BOTH the app's local node_modules AND the root
// hoisted node_modules. npm workspaces hoist most deps to the root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// Force a single React copy across web + native — duplicate React
// causes "Invalid hook call" runtime errors.
config.resolver.disableHierarchicalLookup = true;

// Don't pull other apps' source into this bundle. Their tsconfig
// paths don't match vendor-mobile's so the bundle fails.
config.resolver.blockList = [
  /apps\/host-mobile\/.*/,
  /apps\/admin\/.*/,
  /apps\/web\/.*/,
];

module.exports = withNativeWind(config, { input: "./global.css" });
