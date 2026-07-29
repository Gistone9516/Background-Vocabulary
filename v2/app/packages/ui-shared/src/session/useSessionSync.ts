// 세션 서버 동기화. "언제 저장하나"는 여기서 정하지 않는다 —
// 좁히기 상태 기계가 매 턴 saveSnapshot을, 어휘 생성 기계가 settle 시 completeSession을 이미 낸다.
// 이 훅은 그 명령을 서버 호출로 옮기고 목록을 들고 있을 뿐이다.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Page, SessionRec, SessionSummary, Term } from "@vock/shared";
import type { ApiPort } from "../api/index.js";
import type { NarrowCtx, Question } from "../screens/narrow/index.js";
import { normTerm } from "../screens/kept/index.js";
import { toSessionRec, toSnapshot, type SessionDraft } from "./snapshot.js";

export interface SessionListState {
  items: SessionSummary[];
  cursor: string | null;
  loading: boolean;
  // 저장이 아예 일어나지 않는 상태. 비로그인이 그렇다(스펙 S-1).
  off: boolean;
}

export interface UseSessionSyncOptions {
  api: ApiPort;
  // 로그인 여부. 이것이 false면 서버를 부르지 않는다(S-1).
  enabled: boolean;
  // 사이드바에서 고른 프로젝트. 목록의 범위이자 새 탐색의 배속처다(S-15).
  projectId?: string | null;
}

const EMPTY: SessionListState = { items: [], cursor: null, loading: false, off: true };

export function useSessionSync({ api, enabled, projectId = null }: UseSessionSyncOptions) {
  const [list, setList] = useState<SessionListState>(EMPTY);
  const [query, setQuery] = useState("");

  // 서버에 이미 있는 레코드. 전체 upsert라서 보내지 않은 필드가 지워지므로
  // 프라이머·프로젝트 배속 같은 남의 소관 필드를 여기서 지켜 준다(S-22).
  const known = useRef(new Map<string, SessionRec>());
  // 저장은 순서가 중요하다. 늦게 도착한 이전 턴이 최신 턴을 덮으면 한 턴이 사라진다.
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  const refresh = useCallback(
    (q?: string) => {
      if (!enabled) {
        setList(EMPTY);
        return;
      }
      setList((p) => ({ ...p, loading: true, off: false }));
      api
        .listSessions({ projectId, ...(q ? { q } : {}) })
        .then((page: Page<SessionSummary>) =>
          setList({ items: page.items, cursor: page.nextCursor, loading: false, off: false })
        )
        .catch(() => setList((p) => ({ ...p, loading: false })));
    },
    [api, enabled, projectId]
  );

  const more = useCallback(() => {
    if (!enabled || !list.cursor || list.loading) return;
    setList((p) => ({ ...p, loading: true }));
    api
      .listSessions({ projectId, cursor: list.cursor, ...(query ? { q: query } : {}) })
      .then((page) =>
        setList((p) => ({ items: [...p.items, ...page.items], cursor: page.nextCursor, loading: false, off: false }))
      )
      .catch(() => setList((p) => ({ ...p, loading: false })));
  }, [api, enabled, list.cursor, list.loading, query, projectId]);

  useEffect(() => refresh(), [refresh]);

  // 저장 실패는 여정을 멈추지 않는다(S-3). 삼키되 목록은 갱신하지 않는다.
  const put = useCallback(
    (rec: SessionDraft) => {
      chain.current = chain.current
        .then(() => api.putSession(rec))
        .then((saved) => {
          known.current.set(saved.session_id, saved);
        })
        .catch(() => undefined);
      return chain.current;
    },
    [api]
  );

  // 좁히기 매 턴. 상태 기계가 부른다.
  const saveSnapshot = useCallback(
    (ctx: NarrowCtx, current: Question | null) => {
      if (!enabled) return;
      const prev = known.current.get(ctx.sessionId) ?? null;
      void put(
        toSessionRec({ ctx, narrow: toSnapshot(ctx, current), generated: null, prev, projectId, now: Date.now() })
      );
    },
    [enabled, put, projectId]
  );

  // 생성이 끝난 시점. narrow를 지워야 목록에서 "생성 중"이 풀린다(S-5).
  const completeSession = useCallback(
    (ctx: NarrowCtx, items: Term[]) => {
      if (!enabled) return;
      const prev = known.current.get(ctx.sessionId) ?? null;
      void put(toSessionRec({ ctx, narrow: null, generated: items, prev, projectId, now: Date.now() })).then(() =>
        refresh(query)
      );
    },
    [enabled, put, refresh, query, projectId]
  );

  const remove = useCallback(
    (id: string) => {
      if (!enabled) return;
      // 화면에서 먼저 지운다. 되돌리기는 서버가 유예를 판정한다(S-8).
      setList((p) => ({ ...p, items: p.items.filter((s) => s.session_id !== id) }));
      api.deleteSession(id).catch(() => refresh(query));
    },
    [api, enabled, refresh, query]
  );

  const restore = useCallback(
    async (id: string): Promise<boolean> => {
      if (!enabled) return false;
      const ok = await api.restoreSession(id).catch(() => false);
      if (ok) refresh(query);
      return ok;
    },
    [api, enabled, refresh, query]
  );

  const search = useCallback(
    (q: string) => {
      setQuery(q);
      refresh(q);
    },
    [refresh]
  );

  // 담기 동기화(S-7). 화면은 이미 바뀐 뒤라 실패해도 되돌리지 않는다.
  // term_norm은 담기 판정과 같은 정규화를 쓴다. 두 번째 정규화를 만들면 같은 어휘가 두 행이 된다.
  const syncKeep = useCallback(
    (sessionId: string, term: Term, keeping: boolean) => {
      if (!enabled) return;
      void api
        .keep(sessionId, { term, term_norm: normTerm(term.term), keep: keeping, project_id: projectId })
        .catch(() => undefined);
    },
    [api, enabled, projectId]
  );

  const load = useCallback((id: string) => api.getSession(id), [api]);

  return { list, query, search, more, saveSnapshot, completeSession, syncKeep, remove, restore, load };
}
