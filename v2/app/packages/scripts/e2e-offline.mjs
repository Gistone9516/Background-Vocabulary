// 오프라인 read-through 데코레이터 검증(C4 S3 DS3-2·DS3-3). 목 ApiPort + 메모리 스토어 —
// e2e-auth-client가 HttpApiClient를 검증하는 집 선례 그대로, 서버 없이 논리를 단정한다.
// 음성이 절반이다: 폴백하면 안 되는 경우(비 network 오류·캐시 미스·쓰기 경로)를 함께 본다.
import { withOfflineCache } from "@vock/ui-shared";

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

function memoryStore() {
  let list = null;
  const sessions = new Map();
  return {
    readList: async () => list,
    writeList: async (items) => {
      list = { savedAt: 1, items };
    },
    readSession: async (id) => sessions.get(id) ?? null,
    writeSession: async (rec) => {
      sessions.set(rec.session_id, rec);
    },
    removeSession: async (id) => {
      sessions.delete(id);
    },
    clear: async () => {
      list = null;
      sessions.clear();
    },
    _dump: () => ({ list, sessions }),
  };
}

const NETWORK = { kind: "network" };
const AUTH = { kind: "auth_required" };
const S1 = { session_id: "s1", topic: "커피" };
const REC = { session_id: "s1", user_id: "u1", topic: "커피", narrow: null, generated: [] };

// 켜고 끌 수 있는 목 API. 필요한 메서드만 진짜 동작하고 나머지는 안 불리는 것이 정상이다.
function mockApi(state) {
  const boom = () => {
    throw state.error;
  };
  return {
    listSessions: async () => (state.error ? boom() : { items: [S1], nextCursor: "next" }),
    getSession: async () => (state.error ? boom() : REC),
    deleteSession: async () => (state.error ? boom() : undefined),
    keep: async () => {
      state.keepCalls++;
      if (state.error) boom();
    },
    // 이하 통과 위임 확인용 최소 구현
    config: async () => ({}),
    classify: async () => ({}),
    next: async () => ({}),
    preview: async () => ({}),
    detail: async () => ({}),
    summarize: async () => ({}),
    recommendStream: () => ({ [Symbol.asyncIterator]: async function* () {} }),
    putSession: async (r) => r,
    restoreSession: async () => true,
    listAssets: async () => ({ items: [], nextCursor: null }),
    listProjects: async () => [],
    createProject: async () => ({}),
    deleteProject: async () => {},
    relate: async () => ({}),
    updateLocale: async () => {},
  };
}

const state = { error: null, keepCalls: 0 };
const store = memoryStore();
const flips = [];
const api = withOfflineCache(mockApi(state), store, (v) => flips.push(v));

// ① 온라인 성공 → 캐시 기록(첫 페이지), onChange(false)
{
  const page = await api.listSessions({});
  check("성공 응답이 그대로 온다(cursor 보존)", page.nextCursor === "next" && page.items[0].session_id === "s1");
  check("캐시가 응답으로 덮였다", store._dump().list?.items[0]?.session_id === "s1");
  check("onChange(false)", flips.at(-1) === false);
  await api.getSession("s1");
  check("세션 레코드도 캐시된다", store._dump().sessions.has("s1"));
}

// ①-b 검색·커서 요청은 캐시를 덮지 않는다
{
  store._dump().list.items = [{ session_id: "marker" }];
  await api.listSessions({ q: "커피" });
  await api.listSessions({ cursor: "next" });
  check("검색·커서 결과는 캐시를 안 덮는다", store._dump().list.items[0].session_id === "marker");
  await api.listSessions({}); // 원상 복구(첫 페이지 캐시)
}

// ② 오프라인 + 캐시 히트 → 폴백(cursor null), onChange(true)
{
  state.error = NETWORK;
  const page = await api.listSessions({});
  check("network 실패가 캐시로 폴백된다", page.items[0].session_id === "s1");
  check("폴백 목록은 nextCursor가 null이다(더 보기 제거)", page.nextCursor === null);
  check("onChange(true)", flips.at(-1) === true);
  const rec = await api.getSession("s1");
  check("세션 레코드 폴백", rec?.session_id === "s1");
}

// ③ 음성: network가 아닌 실패는 폴백하지 않는다
{
  state.error = AUTH;
  const got = await api.listSessions({}).then(
    () => "resolved",
    (e) => e.kind
  );
  check("401류는 캐시가 아니라 오류로 전파된다", got === "auth_required");
}

// ④ 음성: 쓰기 경로는 미개입 — 오프라인이면 그대로 실패한다(D-6가 구조로 성립)
{
  state.error = NETWORK;
  const got = await api.keep("s1", {}).then(
    () => "resolved",
    (e) => e.kind
  );
  check("오프라인 keep은 그대로 network 실패다", got === "network" && state.keepCalls === 1);
}

// ⑤ 성공 복귀 → 새 응답 + onChange(false)
{
  state.error = null;
  const page = await api.listSessions({});
  check("복귀하면 서버 응답이 다시 이긴다", page.nextCursor === "next");
  check("onChange(false) 복귀", flips.at(-1) === false);
}

// ⑥ 삭제 성공은 캐시도 지운다 / clear 후 오프라인은 미스
{
  await api.deleteSession("s1");
  check("서버 삭제 성공 시 캐시 레코드도 지운다", !store._dump().sessions.has("s1"));
  await store.clear();
  state.error = NETWORK;
  const got = await api.listSessions({}).then(
    () => "resolved",
    (e) => e.kind
  );
  check("clear 후 오프라인은 캐시 미스 → 원래 오류", got === "network");
}

if (fail > 0) {
  console.error(`오프라인 e2e 실패: ${fail}건`);
  process.exit(1);
}
console.log(`오프라인 데코레이터 e2e 통과: ${pass}건 — 폴백·서버 수리·미개입(음성) 확인.`);
