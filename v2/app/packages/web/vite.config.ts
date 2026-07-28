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
    // 개발 중에는 프록시로 같은 오리진에서 서버를 부른다. 서버에 dev 전용 CORS를 뚫는 것보다
    // 건드리는 곳이 적고, 프로덕션 오리진 정책(SoT 4절 clientCheck)과 섞이지도 않는다.
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
