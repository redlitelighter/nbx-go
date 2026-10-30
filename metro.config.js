const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Must match the file actually imported in src/app/_layout.tsx — pointing at a
// non-existent path makes the Tailwind step wait forever and Metro hang at 0%.
module.exports = withNativeWind(config, { input: "./src/app/global.css" });
