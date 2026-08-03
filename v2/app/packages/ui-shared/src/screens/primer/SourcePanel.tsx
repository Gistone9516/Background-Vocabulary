// 어휘 출처 패널. 넓은 화면에서는 우측 열, 좁은 화면에서는 바텀시트 본문으로 **같은 컴포넌트**가
// 쓰인다(T-6). 두 벌로 만들면 한쪽만 고쳐져 갈라지고 컴파일은 계속 된다 — D-12가 막으려는 상태다.

import type { ReactNode } from "react";
import { useTr } from "../../i18n/locale.js";
import { isSelected, type Selection, type SourceTerm } from "./selection.js";

export interface SourcePanelProps {
  // 스코프 1: 이번 탐색에서 조회·저장한 어휘.
  session: SourceTerm[];
  // 스코프 2: 프로젝트·전체 자산.
  assets: SourceTerm[];
  selection: Selection;
  onToggle(termName: string): void;
  // 스코프 3. null이면 절 자체가 뜨지 않는다(T-4) — ShellDeps.auth·offline과 같은 능력 모델이다.
  mapPanel?: ReactNode | null;
}

function Block({ src, on, onToggle }: { src: SourceTerm; on: boolean; onToggle(): void }) {
  const tr = useTr();
  return (
    <button className={on ? "srcBlock on" : "srcBlock"} onClick={onToggle} aria-pressed={on}>
      <span className="srcTerm">{src.term.term}</span>
      <span className="srcTags">
        {/* 저장과 조회는 동시에 참일 수 있다(C5-S1 E-1). 둘 다면 둘 다 붙는다. */}
        {src.kept ? <span className="srcTag">{tr("primer_from_kept")}</span> : null}
        {src.viewed ? <span className="srcTag">{tr("primer_from_viewed")}</span> : null}
      </span>
      <span className="srcLine">{src.term.one_line}</span>
    </button>
  );
}

export function SourcePanel({ session, assets, selection, onToggle, mapPanel }: SourcePanelProps) {
  const tr = useTr();
  const group = (title: string, items: SourceTerm[]) =>
    items.length === 0 ? null : (
      <section className="srcGroup">
        <h3 className="srcHead">{title}</h3>
        {items.map((s) => (
          <Block key={s.term.term} src={s} on={isSelected(selection, s.term.term)} onToggle={() => onToggle(s.term.term)} />
        ))}
      </section>
    );

  return (
    <div className="srcPanel">
      {group(tr("primer_scope_session"), session)}
      {group(tr("primer_scope_assets"), assets)}
      {mapPanel ?? null}
    </div>
  );
}
