// 개발용 로컬 서버. mock 공급자로 8787에 띄운다(SoT 0-2절의 mock 계층).
// 웹 dev 서버(5180)는 vite 프록시로 /api를 여기로 넘긴다.
// 실 공급자로 띄우려면 VOCK_REAL=1과 .env 실키가 필요하다(C2.4 buildLocalRealDeps).
import { bootLocal } from "@vock/local";

const port = Number(process.env.PORT ?? 8787);
const handle = await bootLocal({ port });
console.log(`local mock 서버 기동: http://127.0.0.1:${handle.port}`);

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    handle.server.close();
    process.exit(0);
  });
}
