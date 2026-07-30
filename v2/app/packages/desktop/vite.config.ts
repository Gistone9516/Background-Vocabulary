// 데스크톱 셸 개발·빌드 설정. web의 것을 미러하되 두 가지가 다르다:
// 포트(5185 — web 5180과 동시 기동 가능해야 한다), 그리고 D-3 빌드 검사.
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ command, mode }) => {
  // D-3: 프로덕션 번들에 상대경로 폴백을 두지 않는다. 미설정이면 여기서 빌드가 깨진다.
  // dev가 "/api"로 되는 이유는 Tauri dev가 vite 서버(같은 오리진)를 로드하기 때문이고,
  // 그 값은 .env.development에 **명시**돼 있다 — 폴백이 아니다.
  const env = loadEnv(mode, here, "");
  if (command === "build" && !env.VITE_API_BASE) {
    throw new Error(
      "VITE_API_BASE가 없다 — 데스크톱 번들은 절대 API 주소가 필수다(C4 D-3). " +
        "상대경로 폴백은 웹뷰 자신을 가리켜 조용히 실패한다. 환경 변수나 .env.production으로 주입할 것."
    );
  }

  return {
    plugins: [react()],
    resolve: {
      // 더 구체적인 경로를 먼저 둔다(web/vite.config.ts와 같은 이유).
      alias: [
        { find: "@vock/ui-shared/styles.css", replacement: resolve(here, "../ui-shared/src/styles/bundle.css") },
        { find: "@vock/ui-shared", replacement: resolve(here, "../ui-shared/src/index.ts") },
        { find: "@vock/tauri", replacement: resolve(here, "../adapters/tauri/src/index.ts") },
        { find: "@vock/shared", replacement: resolve(here, "../shared/src/index.ts") },
      ],
    },
    // Tauri dev가 이 서버를 로드한다(tauri.conf.json devUrl). 포트가 밀리면 Tauri가
    // 빈 화면을 로드하므로 strictPort로 기동 자체를 깬다.
    server: {
      port: 5185,
      strictPort: true,
      proxy: {
        "/api": {
          target: "http://127.0.0.1:8787",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ""),
        },
      },
    },
  };
});
