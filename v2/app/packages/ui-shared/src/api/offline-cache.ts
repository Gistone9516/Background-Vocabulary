// 오프라인 read-through 데코레이터(FR-902, C4 S3 §1-1). ApiPort의 **읽기 두 경로만** 감싼다.
//
// - listSessions/getSession 성공 → 캐시를 응답으로 덮는다(계약 §3-3 서버 수리 원칙, DS3-3).
//   캐시가 성공 응답을 이기는 경로는 없다.
// - network 실패 → 캐시 폴백. 폴백 목록은 cursor:null이라 "더 보기"가 자연히 사라진다.
// - 그 외 실패(401·404 등) → 그대로 전파. 오프라인이 아니라 다른 문제다.
// - 쓰기 메서드는 전부 통과 — **안 감싸는 것만으로 D-6(오프라인은 열람만)이 구조로 성립한다.**
//   오프라인 저장·담기는 지금과 똑같이 실패하고 훅이 삼킨다(S-3).
//
// 명시 위임인 이유: HttpApiClient는 클래스라 스프레드로 메서드가 복사되지 않고,
// ApiPort 반환 타입이 위임 누락을 tsc에서 잡는다 — 메서드가 늘면 여기가 컴파일로 깨진다.
//
// onChange(offline): 폴백이 일어나면 true, 성공 응답이 오면 false. 고지 한 줄의 유일한 신호원.

import type { OfflineStore } from "../session/offline-store.js";
import type { ApiPort, ListSessionsArgs } from "./port.js";
import { isApiError } from "./errors.js";
import type { Page, SessionRec, SessionSummary } from "@vock/shared";

function isNetworkFailure(e: unknown): boolean {
  return isApiError(e) && e.kind === "network";
}

export function withOfflineCache(api: ApiPort, store: OfflineStore, onChange?: (offline: boolean) => void): ApiPort {
  const online = (): void => onChange?.(false);
  const offline = (): void => onChange?.(true);

  return {
    // ── 감싸는 두 경로 ───────────────────────────────────────────────
    async listSessions(q: ListSessionsArgs, signal?: AbortSignal): Promise<Page<SessionSummary>> {
      try {
        const page = await api.listSessions(q, signal);
        online();
        // 첫 페이지(커서 없는 요청)만 캐시한다 — 오프라인 목록은 한 페이지다(S-9의 캐시판).
        // 검색·페이지 이동 결과로 덮으면 "마지막으로 본 필터"가 정본 행세를 한다.
        if (!q.cursor && !q.q) void store.writeList(page.items).catch(() => {});
        return page;
      } catch (e) {
        if (!isNetworkFailure(e)) throw e;
        offline();
        const cached = await store.readList().catch(() => null);
        if (!cached) throw e; // 캐시 미스 — 원래 오류가 화면의 기존 network 경로를 탄다
        return { items: cached.items, nextCursor: null };
      }
    },

    async getSession(id: string, signal?: AbortSignal): Promise<SessionRec | null> {
      try {
        const rec = await api.getSession(id, signal);
        online();
        if (rec) void store.writeSession(rec).catch(() => {});
        return rec;
      } catch (e) {
        if (!isNetworkFailure(e)) throw e;
        offline();
        const cached = await store.readSession(id).catch(() => null);
        if (!cached) throw e;
        return cached;
      }
    },

    // ── 통과 경로(전부) — 서버 삭제 성공 시에만 캐시도 지운다 ─────────
    async deleteSession(id: string, signal?: AbortSignal): Promise<void> {
      await api.deleteSession(id, signal);
      void store.removeSession(id).catch(() => {});
    },

    config: (signal) => api.config(signal),
    classify: (input, signal) => api.classify(input, signal),
    next: (input, signal) => api.next(input, signal),
    preview: (input, signal) => api.preview(input, signal),
    detail: (input, sessionId, signal) => api.detail(input, sessionId, signal),
    summarize: (input, signal) => api.summarize(input, signal),
    recommendStream: (input, signal) => api.recommendStream(input, signal),
    putSession: (rec, signal) => api.putSession(rec, signal),
    restoreSession: (id, signal) => api.restoreSession(id, signal),
    keep: (sessionId, body, signal) => api.keep(sessionId, body, signal),
    listAssets: (projectId, cursor, signal) => api.listAssets(projectId, cursor, signal),
    listViewed: (sessionId, signal) => api.listViewed(sessionId, signal),
    // 카드와 세션 자산은 캐시하지 않는다(V-20). 오프라인이면 실패가 그대로 올라가고
    // 카드는 뜨지 않는다 — 개수 없는 카드는 재인 단서가 약해 존재 이유가 흐려진다.
    recentCard: (projectId, signal) => api.recentCard(projectId, signal),
    listSessionAssets: (sessionId, signal) => api.listSessionAssets(sessionId, signal),
    listProjects: (signal) => api.listProjects(signal),
    createProject: (name, signal) => api.createProject(name, signal),
    deleteProject: (id, signal) => api.deleteProject(id, signal),
    relate: (input, signal) => api.relate(input, signal),
    updateLocale: (locale, signal) => api.updateLocale(locale, signal),
  };
}
