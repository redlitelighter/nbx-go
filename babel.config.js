module.exports = function (api) {
  api.cache(true);
  return {
    // NativeWind v4: both entries are PRESETS (listing them under `plugins`
    // makes Babel look for "babel-plugin-babel-preset-expo" and fail).
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [
      ["module-resolver", { root: ["./"], alias: { "@": "./src" } }],
    ],
  };
};
