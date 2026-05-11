// Expo config plugin: patches expo-device's UIDevice.swift so it
// compiles on Xcode 26. The package ships
//
//   return TARGET_OS_SIMULATOR != 0
//
// which only worked when TargetConditionals was implicitly imported —
// broken in Xcode 26's stricter Swift compiler. We rewrite the body
// to use the modern compile-time directive.
//
// Runs during `expo prebuild` (after node_modules install, before
// xcode compiles), so it doesn't depend on postinstall hooks firing.
// Idempotent: re-running on an already-patched file is a no-op.

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
