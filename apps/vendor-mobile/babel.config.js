// Babel config for the vendor-mobile Expo app. NativeWind is a JSX
// transform — it rewrites `className` into RN style props at compile
// time — so it must run before babel-preset-expo's JSX preset.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
