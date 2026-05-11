// See vendor-mobile/metro.config.js for the rationale; both apps share
// the same monorepo + NativeWind shape. blockList is needed because
// Metro's monorepo watch + expo-router's require.context glob accidentally
// crawl SIBLING apps' `app/` directories, and their `@/` tsconfig paths
// resolve to a different root — breaking the bundle.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;
config.resolver.blockList = [
  /apps\/vendor-mobile\/.*/,
  /apps\/admin\/.*/,
  /apps\/web\/.*/,
];

module.exports = withNativeWind(config, { input: "./global.css" });
