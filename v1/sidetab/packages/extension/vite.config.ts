import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { copyFileSync, mkdirSync } from "fs";

// 사이드패널 페이지와 서비스워커를 각각 빌드한다.
// 서비스워커는 스트리밍 fetch를 수행하지 않는다(MV3 서비스워커 30초 fetch 제한).
// 스트리밍 fetch는 사이드패널 페이지에서만 실행한다.

// manifest.json과 아이콘을 dist에 복사하는 인라인 Vite 플러그인.
// 별도 플러그인 패키지 없이 Rollup writeBundle 훅을 쓴다.
function copyManifestPlugin() {
  return {
    name: "copy-manifest",
    writeBundle(options: { dir?: string }) {
      const outDir = options.dir ?? "dist";
      mkdirSync(outDir, { recursive: true });
      copyFileSync("manifest.json", `${outDir}/manifest.json`);
    },
  };
}

export default defineConfig({
  plugins: [react(), copyManifestPlugin()],
  resolve: {
    alias: {
      "@sidetab/shared": path.resolve(__dirname, "../shared/index.ts"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // 사이드패널 HTML 진입점. Vite가 html 안의 script 태그를 따라 번들한다.
        sidepanel: path.resolve(__dirname, "sidepanel.html"),
        // 서비스워커 진입점. dist/sw.js로 출력해야 manifest.json의 경로와 일치한다.
        sw: path.resolve(__dirname, "sw/background.ts"),
      },
      output: {
        // 서비스워커는 dist/sw.js 루트에, 그 외는 assets 폴더에 넣는다.
        entryFileNames: (chunk) => {
          if (chunk.name === "sw") return "sw.js";
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  // 개발 서버는 사이드패널 디버깅용. 실제 크롬 확장 로드는 dist 폴더를 쓴다.
  server: {
    port: 5174,
  },
});
