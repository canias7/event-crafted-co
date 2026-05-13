// Metro config for monorepo support. See vendor-mobile/metro.config.js
// for the full rationale — same shape, mirror image of the blockList.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Extend Expo's default watchFolders rather than replace — expo doctor
// in SDK 54 requires the defaults to remain in the list.
config.watchFolders = [...(config.watchFolders ?? []), monorepoRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

config.resolver.blockList = [
  /apps\/vendor-mobile\/.*/,
  /apps\/admin\/.*/,
  /apps\/web\/.*/,
];

module.exports = withNativeWind(config, { input: "./global.css" });
