// Metro config for monorepo support. Watches the workspace root so
// edits in packages/core hot-reload. Resolver looks in both the app's
// local node_modules and the hoisted root node_modules so npm
// workspace deps resolve correctly.
//
// blockList keeps other apps' source out of vendor-mobile's bundle —
// their tsconfig path aliases don't match this app, so without this
// the bundler chokes on cross-app imports.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Extend Expo's default watchFolders rather than replace — expo doctor
// in SDK 54 requires the defaults to remain in the list.
config.watchFolders = [...(config.watchFolders ?? []), monorepoRoot];

// Resolve modules from BOTH the app's local node_modules AND the root
// hoisted node_modules. npm workspaces hoist most deps to the root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// Don't pull other apps' source into this bundle. Their tsconfig
// paths don't match vendor-mobile's so the bundle fails.
config.resolver.blockList = [
  /apps\/host-mobile\/.*/,
  /apps\/admin\/.*/,
  /apps\/web\/.*/,
];

module.exports = withNativeWind(config, { input: "./global.css" });
