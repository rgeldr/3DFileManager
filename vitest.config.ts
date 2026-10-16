import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/lib/dragPaths.ts",
        "src/lib/importMeta.ts",
        "src/lib/paneWidths.ts",
        "src/lib/previewSplit.ts",
        "src/lib/previewLights.ts",
        "src/lib/gridWindow.ts",
        "src/lib/deleteKey.ts",
        "src/lib/tagFilter.ts",
        "src/lib/typeFilter.ts",
        "src/lib/popoverPosition.ts",
        "src/components/FileGrid.tsx",
      ],
    },
  },
});
