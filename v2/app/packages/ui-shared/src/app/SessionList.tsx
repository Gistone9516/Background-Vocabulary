// 사이드바의 이전 탐색 목록. 목록을 어떻게 얻는지는 모르고 받은 것만 그린다.
// 클래스 이름은 v1에서 온 기존 것을 쓴다(.hist*). 새로 만들지 않는다.

import { useState } from "react";
import type { SessionSummary } from "@vock/shared";
import { useTr } from "../i18n/locale.js";

export interface SessionListProps {
  items: SessionSummary[];
  // 로그인하지 않아 저장 자체가 꺼진 상태(스펙 S-1). 빈 목록과 다른 뜻이라 따로 받는다.
  off: boolean;
  // 오프라인 폴백 고지(C4 S3 DS3-1). off(비로그인)·빈 목록과 셋 다 다른 축이라 문구를 통째로
  // 받는다 — 문구를 아는 쪽(여정)이 넘긴다(S-34와 같은 방향). null이면 없음.
  notice?: string | null;
  loading: boolean;
  hasMore: boolean;
  query: string;
  onSearch(q: string): void;
  onOpen(id: string): void;
  onRemove(id: string): void;
  // 유예 안이면 true. 유예가 지났으면 false를 돌려주고 화면이 그 사실을 알린다(S-8).
  onRestore(id: string): Promise<boolean>;
  onMore(): void;
}

export function SessionList({
  items,
  off,
  notice,
  loading,
  hasMore,
  query,
  onSearch,
  onOpen,
  onRemove,
  onRestore,
  onMore,
}: SessionListProps) {
  const tr = useTr();
  // 방금 지운 것. 유예 안이면 되돌릴 수 있다(S-8).
  const [undo, setUndo] = useState<{ id: string; expired: boolean } | null>(null);

  if (off) return <p className="sbEmpty">{tr("sessions_off")}</p>;

  return (
    <>
      {notice ? <p className="sbEmpty">{notice}</p> : null}
      {(items.length > 0 || query) ? (
        <input
          className="sbSearch"
          value={query}
          placeholder={tr("sessions_search_ph")}
          aria-label={tr("sessions_search_ph")}
          onChange={(e) => onSearch(e.target.value)}
        />
      ) : null}

      {items.length === 0 && !loading ? <p className="sbEmpty">{tr("sessions_empty")}</p> : null}

      <ul className="history">
        {items.map((s) => (
          <li key={s.session_id} className="histitem">
            <button className="histmain" onClick={() => onOpen(s.session_id)}>
              <span className="histtopic">{s.topic || tr("session_untitled")}</span>
              <span className="histmeta">{s.generating ? tr("session_generating") : (s.area ?? "")}</span>
            </button>
            <button
              className="histdel"
              aria-label={tr("session_delete")}
              title={tr("session_delete")}
              onClick={() => {
                setUndo({ id: s.session_id, expired: false });
                onRemove(s.session_id);
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      {hasMore ? (
        <button className="link" onClick={onMore} disabled={loading}>
          {loading ? tr("sessions_loading") : tr("sessions_more")}
        </button>
      ) : null}

      {undo ? (
        <p className="sbEmpty">
          {undo.expired ? (
            tr("session_undo_expired")
          ) : (
            <>
              {tr("session_deleted")}{" "}
              <button
                className="link"
                onClick={async () => {
                  const ok = await onRestore(undo.id);
                  setUndo(ok ? null : { ...undo, expired: true });
                }}
              >
                {tr("session_undo")}
              </button>
            </>
          )}
        </p>
      ) : null}
    </>
  );
}
