// CORS·clientCheck 경계 검사(C4 S2 DS2-1·DS2-3). mock 부트 셋을 띄워 양성·음성을 다 본다.
// 통과만 보면 막는지 알 수 없다 — 막혀야 하는 케이스가 실제로 403/헤더 부재인지를 단정한다.
import { bootLocal, buildMockDeps } from "@vock/local";

let pass = 0;
let fail = 0;
function check(name, ok) {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.error(`  FAIL  ${name}`);
  }
}

const ORIGIN = "http://allowed.test";
const OTHER = "http://other.test";
const TOKEN = "test-desktop-token";

// ① 기본 부트: CORS도 clientCheck도 없다 — 현행 동작이 변하지 않았는가(DS2-1 "미설정 = 미적용").
{
  const h = await bootLocal({ port: 0, deps: buildMockDeps() });
  const base = `http://127.0.0.1:${h.port}`;
  const res = await fetch(`${base}/health`, { headers: { origin: ORIGIN } });
  check("미설정 부트: Origin을 보내도 CORS 헤더가 없다", res.ok && res.headers.get("access-control-allow-origin") === null);
  const cost = await fetch(`${base}/classify`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  check("미설정 부트: 비용 경로가 clientCheck 없이 도달한다", cost.status !== 403);
  h.server.close();
}

// ② CORS 부트(DS2-1): 허용 오리진만 헤더를 받는다.
{
  const h = await bootLocal({ port: 0, deps: { ...buildMockDeps(), corsOrigins: [ORIGIN] } });
  const base = `http://127.0.0.1:${h.port}`;
  const okRes = await fetch(`${base}/health`, { headers: { origin: ORIGIN } });
  check("허용 Origin → Access-Control-Allow-Origin 반환", okRes.headers.get("access-control-allow-origin") === ORIGIN);
  const badRes = await fetch(`${base}/health`, { headers: { origin: OTHER } });
  check("다른 Origin → 허용 헤더 없음", badRes.headers.get("access-control-allow-origin") === null);
  const pre = await fetch(`${base}/classify`, {
    method: "OPTIONS",
    headers: { origin: ORIGIN, "access-control-request-method": "POST", "access-control-request-headers": "x-vock-client" },
  });
  check("프리플라이트가 x-vock-client를 허용한다", (pre.headers.get("access-control-allow-headers") ?? "").toLowerCase().includes("x-vock-client"));
  h.server.close();
}

// ③ clientCheck 부트(DS2-3): 표식 없는 비용 요청은 403, 표식이 있으면 통과. /health는 대상 밖.
{
  const h = await bootLocal({
    port: 0,
    deps: { ...buildMockDeps(), clientCheck: { allowedOrigins: [ORIGIN], desktopToken: TOKEN } },
  });
  const base = `http://127.0.0.1:${h.port}`;
  const bare = await fetch(`${base}/classify`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  check("무표식 비용 요청 → 403", bare.status === 403);
  const withOrigin = await fetch(`${base}/classify`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: "{}" });
  check("허용 Origin 비용 요청 → 통과", withOrigin.status !== 403);
  const withToken = await fetch(`${base}/classify`, { method: "POST", headers: { "content-type": "application/json", "x-vock-client": TOKEN }, body: "{}" });
  check("데스크톱 표식 비용 요청 → 통과", withToken.status !== 403);
  const wrongToken = await fetch(`${base}/classify`, { method: "POST", headers: { "content-type": "application/json", "x-vock-client": "wrong" }, body: "{}" });
  check("틀린 표식 → 403", wrongToken.status === 403);
  const health = await fetch(`${base}/health`);
  check("/health는 clientCheck 대상이 아니다", health.ok);
  h.server.close();
}

if (fail > 0) {
  console.error(`경계 e2e 실패: ${fail}건`);
  process.exit(1);
}
console.log(`CORS·clientCheck e2e 통과: ${pass}건 — 미설정 무변화, 허용/거부 양쪽 확인.`);
