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

// expo-router bundles its own @react-navigation/native, which nests its own
// @react-navigation/core. Even though both copies are the same version, they
// are different JS module instances — so React contexts created in one are
// invisible to consumers in the other. This causes the runtime error:
//   "Couldn't find the prevent remove context. Is your component inside NavigationContent?"
//
// Fix: intercept every Metro resolution of @react-navigation/core and
// redirect it to the single top-level copy so provider and consumer share
// the exact same context objects.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === "@react-navigation/core" ||
    moduleName.startsWith("@react-navigation/core/")
  ) {
    return context.resolveRequest(
      {
        ...context,
        // Pretend the import originates from the project root so Metro
        // always picks node_modules/@react-navigation/core, not any
        // nested copy inside expo-router's own node_modules.
        originModulePath: path.join(__dirname, "package.json"),
      },
      moduleName,
      platform
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

export default config;
