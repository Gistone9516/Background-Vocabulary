// 난이도 선택. 깊이별 대표 어휘를 미리 보여 주고 사용자가 감으로 고르게 한다.
// 프리뷰는 한도에 집계하지 않는 보조 정보라 실패해도 선택은 계속할 수 있어야 한다.

import { tr, type StringKey } from "../../i18n/strings.js";
import type { Difficulty, PreviewState } from "./types.js";

export interface DifficultyScreenProps {
  preview: PreviewState;
  // 좁히기 종료 사유 고지(S2 D-9). 화면 바깥에 형제로 두면 여백을 못 받아 잘린다.
  notice?: string | null;
  onPick(d: Difficulty): void;
}

const LEVELS: { key: Difficulty; name: StringKey; desc: StringKey; slot: "basic" | "inter" | "adv"; bars: number }[] = [
  { key: "기초", name: "diff_basic", desc: "diff_basic_desc", slot: "basic", bars: 1 },
  { key: "중급", name: "diff_inter", desc: "diff_inter_desc", slot: "inter", bars: 2 },
  { key: "심화", name: "diff_adv", desc: "diff_adv_desc", slot: "adv", bars: 3 },
];

export function DifficultyScreen({ preview, notice, onPick }: DifficultyScreenProps) {
  return (
    <main className="scroll pad screenIn">
      {notice ? <p className="listnote">{notice}</p> : null}
      <p className="eyebrow">{tr("diff_eyebrow")}</p>
      <h2>{tr("diff_title")}</h2>
      <p className="lead diffintro">{tr("diff_sub")}</p>

      <div className="difflist">
        {LEVELS.map((lv) => {
          const sample = preview.phase === "ready" ? preview.out[lv.slot] : null;
          return (
            <button key={lv.key} className="diffcard" onClick={() => onPick(lv.key)}>
              <span className="diffhead">
                <span className="diffname">{tr(lv.name)}</span>
                <span className="diffbars" aria-hidden="true">
                  {[1, 2, 3].map((n) => (
                    <i key={n} style={n > lv.bars ? { opacity: 0.25 } : undefined} />
                  ))}
                </span>
              </span>
              <span className="diffdesc">{tr(lv.desc)}</span>
              <span className="diffex">
                {sample ? (
                  <>
                    <span className="diffexTerm">{sample.term}</span>
                    <span className="diffexLine">{sample.line}</span>
                  </>
                ) : (
                  // 프리뷰가 없어도 고를 수 있다. 자리만 비워 둔다.
                  <span className="diffexSkel" aria-hidden="true">
                    <i />
                    <i />
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {preview.phase === "failed" ? <p className="listnote">{tr("diff_preview_failed")}</p> : null}
    </main>
  );
}
