// 로그인 클라이언트 검증(C3 S5a). 네트워크 없이 순수 함수와 재시도 규칙만 돌린다.
// 목 fetch를 주입해 401 재발급 경로를 실측한다.
import { challengeOf, readCallback, buildAuthorizeUrl, classifyResponse, HttpApiClient } from "@vock/ui-shared";

let failures = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

console.log("로그인 클라이언트 검증:");

// PKCE
{
  // RFC 7636 부록 B의 알려진 벡터.
  const v = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const c = await challengeOf(v);
  check("PKCE challenge가 규격 벡터와 일치", c === "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", c);
  check("challenge는 결정적", (await challengeOf(v)) === c);
}

// state 대조 (A-4)
{
  const ok = readCallback("?code=abc&state=S1", "S1");
  check("state 일치면 code를 돌려준다", ok.code === "abc");
  const bad = readCallback("?code=abc&state=OTHER", "S1");
  check("state 불일치면 교환하지 않는다", bad.error === "state_mismatch");
  const none = readCallback("?code=abc&state=S1", null);
  check("기대 state가 없으면 교환하지 않는다", none.error === "state_mismatch");
  const denied = readCallback("?error=access_denied", "S1");
  check("사용자 거부는 오류로 전달", denied.error === "access_denied");
}

// authorize URL
{
  const u = buildAuthorizeUrl({ clientId: "CID", redirectUri: "https://x/y", challenge: "CH", state: "ST" });
  check("S256 방식과 필수 파라미터 포함",
    u.includes("code_challenge_method=S256") && u.includes("client_id=CID") && u.includes("state=ST"));
}

// 인증 에러 분류 (A-9)
{
  const cases = [
    ["AUTH_FAILED", "auth_failed"],
    ["TOKEN_REVOKED", "session_expired"],
    ["TOKEN_EXPIRED", "session_expired"],
    ["AUTH_REQUIRED", "auth_required"],
  ];
  for (const [code, kind] of cases) {
    const e = classifyResponse(401, { error: code, message: "서버 문구" });
    check(`${code} → ${kind}`, e.kind === kind && e.message === "서버 문구");
  }
}

// 401 재발급 1회 (A-7)
{
  const calls = [];
  const mk = (plan) => {
    let i = 0;
    return async (url, init) => {
      calls.push(String(url).replace(/^https?:\/\/[^/]+/, "") + ":" + (init?.headers?.authorization ?? "none"));
      const r = plan[i++] ?? plan[plan.length - 1];
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
    };
  };

  // 첫 요청 401 → refresh 성공 → 원 요청 재시도 성공
  calls.length = 0;
  let token = "OLD";
  const okClient = new HttpApiClient({
    baseUrl: "http://t",
    getAccessToken: () => token,
    fetch: mk([
      { status: 401, body: { error: "TOKEN_EXPIRED", message: "만료" } },
      { status: 200, body: { access_token: "NEW", refresh_token: "R2", expires_in: 900 } },
      { status: 200, body: { narrowMin: 3, narrowMax: { free: 3, paid: 8 } } },
    ]),
    onUnauthorized: async () => {
      const s = await okClient.refresh("R1");
      if (!s) return null;
      token = s.access_token;
      return s.access_token;
    },
  });
  const cfg = await okClient.config();
  check("401 뒤 재발급하고 원 요청을 다시 보낸다", cfg.narrowMin === 3, JSON.stringify(calls));
  check("재시도는 새 토큰으로 나간다", calls[2] === "/config:Bearer NEW", JSON.stringify(calls));
  check("재발급 호출은 정확히 1회", calls.filter((c) => c.startsWith("/auth/refresh")).length === 1);

  // refresh도 401 → 재시도 없음
  calls.length = 0;
  const deadClient = new HttpApiClient({
    baseUrl: "http://t",
    getAccessToken: () => "OLD",
    fetch: mk([
      { status: 401, body: { error: "TOKEN_EXPIRED", message: "만료" } },
      { status: 401, body: { error: "TOKEN_REVOKED", message: "폐기" } },
    ]),
    onUnauthorized: async () => {
      const s = await deadClient.refresh("R1");
      return s ? s.access_token : null;
    },
  });
  let threw = null;
  await deadClient.config().catch((e) => { threw = e; });
  check("재발급 실패면 원 요청을 다시 보내지 않는다", calls.length === 2, JSON.stringify(calls));
  check("재발급 실패는 세션 만료로 전달", threw && threw.kind === "session_expired", JSON.stringify(threw));

  // 폐기된 refresh는 예외가 아니라 null (재로그인 필요)
  calls.length = 0;
  const revoked = new HttpApiClient({
    baseUrl: "http://t",
    fetch: mk([{ status: 401, body: { error: "TOKEN_REVOKED", message: "폐기" } }]),
  });
  check("폐기된 refresh는 null을 돌려준다", (await revoked.refresh("R")) === null);
}

// 로그아웃은 서버가 실패해도 던지지 않는다 (A-8)
{
  const c = new HttpApiClient({
    baseUrl: "http://t",
    fetch: async () => new Response("boom", { status: 500 }),
  });
  let threw = false;
  await c.logout("R").catch(() => { threw = true; });
  check("서버 오류에도 로그아웃은 통과한다", !threw);
}

if (failures) {
  console.error(`\n로그인 클라이언트 검증 실패: ${failures}건`);
  process.exit(1);
}
console.log("\n로그인 클라이언트 검증 통과.");
