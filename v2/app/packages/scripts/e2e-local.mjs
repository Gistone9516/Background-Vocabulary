// local mock e2e(C1 완료 기준). 로컬 부트를 임의 포트로 띄우고 핵심 여정을 관통시킨다:
// /health → /config → /classify → /next → /recommend(SSE). 실패 시 비정상 종료.
// 빌드 산출물(dist)을 소비하므로 실행 전 `pnpm build`가 선행되어야 한다(gate 스크립트가 보장).
import { bootLocal } from "@vock/local";

let failures = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

async function postJson(base, path, body) {
  const res = await fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

function parseSse(text) {
  const events = [];
  let doneMarker = false;
  for (const line of text.split("\n")) {
    const l = line.trim();
    if (!l.startsWith("data:")) continue;
    const payload = l.slice(5).trim();
    if (payload === "[DONE]") { doneMarker = true; continue; }
    try { events.push(JSON.parse(payload)); } catch { /* 부분 줄 무시 */ }
  }
  return { events, doneMarker };
}

const { server, port } = await bootLocal({ port: 0 });
const base = `http://127.0.0.1:${port}`;
console.log(`local 부트 기동: ${base}`);

try {
  // 1. health
  const health = await fetch(base + "/health").then((r) => r.json());
  check("/health ok", health && health.ok === true);

  // 2. config
  const config = await fetch(base + "/config").then((r) => r.json());
  check("/config narrowMax 존재", config && config.narrowMax && typeof config.narrowMax.free === "number");

  // 3. classify
  const clf = await postJson(base, "/classify", { raw_input: "PID 제어로 로봇 팔을 안정화하고 싶어요", outputLocale: "ko" });
  check("/classify 200", clf.status === 200, `status=${clf.status}`);
  check("/classify domain 문자열", typeof clf.json.domain === "string" && clf.json.domain.length > 0);
  check("/classify choices 비어있지 않음", Array.isArray(clf.json.choices) && clf.json.choices.length > 0);
  check("/classify 라우팅 필드", clf.json.search_locale === "en" && clf.json.domain_risk === "low");

  // 4. next
  const nxt = await postJson(base, "/next", {
    domain: clf.json.domain,
    job_type: clf.json.job_type,
    history: [{ label: clf.json.choices[0].label, action: "선택" }],
    outputLocale: "ko",
  });
  check("/next 200", nxt.status === 200, `status=${nxt.status}`);
  check("/next enough 불리언", typeof nxt.json.enough === "boolean");
  check("/next choices 배열", Array.isArray(nxt.json.choices));

  // 5. recommend (SSE)
  const recRes = await fetch(base + "/recommend", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      area: clf.json.domain,
      job_type: clf.json.job_type,
      domain: "pid_control",
      topic: "PID 제어 안정화",
      locale: "en",
      domain_risk: "low",
      outputLocale: "ko",
      tier: "free",
    }),
  });
  check("/recommend content-type SSE", (recRes.headers.get("content-type") || "").includes("text/event-stream"));
  const { events, doneMarker } = parseSse(await recRes.text());
  const terms = events.filter((e) => e.type === "term");
  const done = events.some((e) => e.type === "done");
  check("/recommend term 이벤트 ≥1", terms.length >= 1, `terms=${terms.length}`);
  check("/recommend term 형태", terms[0] && typeof terms[0].term?.term === "string");
  check("/recommend done 이벤트", done);
  check("/recommend [DONE] 마커", doneMarker);
} finally {
  await new Promise((r) => server.close(() => r()));
}

if (failures > 0) {
  console.error(`\nlocal mock e2e 실패: ${failures}건.`);
  process.exit(1);
}
console.log("\nlocal mock e2e 통과: /classify→/next→/recommend 관통(mock LLM).");
