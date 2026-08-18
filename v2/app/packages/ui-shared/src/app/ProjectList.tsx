// 사이드바의 프로젝트 목록. 선택된 프로젝트가 세션 목록의 범위와 새 탐색의 배속을 정한다(S-15).
// 클래스는 v1에서 온 기존 것을 쓴다(.drawerItem / .sel).

import { useState } from "react";
import type { Project } from "@vock/shared";
import { useTr } from "../i18n/locale.js";

export interface ProjectListProps {
  items: Project[];
  // 로그인하지 않아 프로젝트 자체가 없는 상태. 빈 목록과 다른 뜻이다.
  off: boolean;
  selected: string | null;
  onSelect(id: string | null): void;
  onCreate(name: string): void;
  onRemove(id: string): void;
}

export function ProjectList({ items, off, selected, onSelect, onCreate, onRemove }: ProjectListProps) {
  const tr = useTr();
  const [adding, setAdding] = useState("");

  if (off) return <p className="sbEmpty">{tr("projects_off")}</p>;

  const submit = () => {
    const name = adding.trim();
    if (!name) return;
    onCreate(name);
    setAdding("");
  };

  return (
    <>
      {items.length === 0 ? <p className="sbEmpty">{tr("projects_empty")}</p> : null}

      {/* .drawerWrap 을 쓰면 안 된다. v1 의 플로팅 선택 패널을 화면에 띄우던 오버레이라
          position:fixed; inset:0; z-index:45 다 — 사이드바 안의 평범한 목록에 붙이면 뷰포트
          전체를 덮는 투명 레이어가 되어 앱 전체가 클릭을 못 받는다(실측 2026-08-18). */}
      <ul className="plist">
        {items.map((p) => (
          <li key={p.project_id} className={p.project_id === selected ? "drawerItem sel" : "drawerItem"}>
            {/* 같은 것을 다시 누르면 선택이 풀린다. 전체 보기로 돌아가는 별도 버튼을 두지 않는다. */}
            <button className="histmain" onClick={() => onSelect(p.project_id === selected ? null : p.project_id)}>
              {p.name}
            </button>
            <button
              className="histdel"
              aria-label={tr("project_delete")}
              title={tr("project_delete_hint")}
              onClick={() => onRemove(p.project_id)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <input
        className="sbSearch"
        value={adding}
        placeholder={tr("project_new_ph")}
        aria-label={tr("project_new_ph")}
        onChange={(e) => setAdding(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
      />
    </>
  );
}
