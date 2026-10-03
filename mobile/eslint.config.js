import { defineConfig } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";
// https://docs.expo.dev/guides/using-eslint/

export default defineConfig([
  expoConfig,
  {
    settings: {
      "import/resolver": {
        node: {
          extensions: [".js", ".jsx", ".ts", ".tsx"],
        },
        typescript: {
          alwaysTryTypes: true,
          project: "./tsconfig.json",
        },
      },
    },
  },
  {
    // SDK 57 adds compiler diagnostics for existing native animation, layout,
    // and state synchronization code. Keep them visible while preserving the
    // current reader behavior; React Compiler skips unsupported components.
    files: [
      "hooks/use-color-scheme.web.ts",
      "src/components/NavigationSheet.tsx",
      "src/components/WordAnalysisBottomSheet.tsx",
      "src/components/ui/NeumorphButton.tsx",
      "src/features/assemblies/AssembliesScreen.tsx",
      "src/features/calendar/CalendarScreen.tsx",
      "src/features/commentary/CommentaryScreen.tsx",
      "src/screens/VerseDetailContent.tsx",
    ],
    rules: {
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    ignores: ["dist/*"],
  },
]);
