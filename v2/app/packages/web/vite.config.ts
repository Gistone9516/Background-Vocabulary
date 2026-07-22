// 웹 SPA 개발·빌드 설정. ui-shared와 shared를 소스로 alias해 개발 중 수정이 바로 반영되게 한다.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // 더 구체적인 경로를 먼저 둔다.
    alias: [
      { find: "@vock/ui-shared/styles.css", replacement: resolve(here, "../ui-shared/src/styles/bundle.css") },
      { find: "@vock/ui-shared", replacement: resolve(here, "../ui-shared/src/index.ts") },
      { find: "@vock/shared", replacement: resolve(here, "../shared/src/index.ts") },
    ],
  },
  server: {
    port: 5180,
    strictPort: true,
  },
});
