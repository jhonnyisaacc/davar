import path from "path";
import { fileURLToPath } from "url";
import { getDefaultConfig } from "expo/metro-config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = getDefaultConfig(__dirname);
// Required by Expo SQLite when validating the shared app in a web browser.
config.resolver.assetExts.push("wasm");

config.watchFolders = [path.resolve(__dirname, "..")];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "node_modules"),
  path.resolve(__dirname, "..", "node_modules"),
];

export default config;
