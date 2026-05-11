// See apps/vendor-mobile/plugins/patch-expo-device.js for context.
// Duplicated rather than imported so each Expo app stays self-contained
// (Expo config plugins are resolved relative to the app, not the repo).

const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const BROKEN = "return TARGET_OS_SIMULATOR != 0";
const FIXED = [
  "#if targetEnvironment(simulator)",
  "    return true",
  "#else",
  "    return false",
  "#endif",
].join("\n");

const withExpoDevicePatch = (config) =>
  withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const file = path.join(
        cfg.modRequest.projectRoot,
        "..",
        "..",
        "node_modules",
        "expo-device",
        "ios",
        "UIDevice.swift",
      );
      if (!fs.existsSync(file)) return cfg;
      const src = fs.readFileSync(file, "utf8");
      if (!src.includes(BROKEN)) return cfg;
      fs.writeFileSync(file, src.replace(BROKEN, FIXED));
      return cfg;
    },
  ]);

module.exports = withExpoDevicePatch;
