// 개발용 로컬 서버. mock 공급자로 8787에 띄운다(SoT 0-2절의 mock 계층).
// 웹 dev 서버(5180)·데스크톱 dev 서버(5185)는 vite 프록시로 /api를 여기로 넘긴다.
//
// 실 공급자 부트(buildLocalRealDeps)는 여기 없다 — e2e-real.mjs가 자기 부트를 직접 조립한다.
// (이 머리주석은 예전에 "VOCK_REAL=1로 실 공급자"라고 적혀 있었으나 그 분기는 구현된 적이 없다.
//  C4 S2에서 발견해 사실에 맞게 고쳤다 — 적혀 있고 없는 기능은 다음 세션을 속인다.)
//
// VOCK_CORS_ORIGINS(콤마 구분)를 주면 CORS 미들웨어가 붙는다(C4 S2 DS2-1). 미설정 = 현행 그대로.
// 로컬에서 CORS 동작을 실측할 때만 쓴다 — vite 프록시 경로는 같은 오리진이라 CORS가 일어나지 않는다.
import { bootLocal, buildMockDeps } from "@vock/local";

const port = Number(process.env.PORT ?? 8787);
const corsOrigins = (process.env.VOCK_CORS_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const deps = {
  ...buildMockDeps(),
  ...(corsOrigins.length > 0 ? { corsOrigins } : {}),
};

const handle = await bootLocal({ port, deps });
console.log(`local mock 서버 기동: http://127.0.0.1:${handle.port}${corsOrigins.length ? ` (CORS: ${corsOrigins.join(", ")})` : ""}`);

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    handle.server.close();
    process.exit(0);
  });
}
