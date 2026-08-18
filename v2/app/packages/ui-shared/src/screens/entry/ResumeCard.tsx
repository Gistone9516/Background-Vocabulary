// 재진입 카드(FR-707). 진입 화면 트랙 왼쪽 위.
// 돌아올 이유를 회상시키지 않고 재인시킨다 — 분야와 담은 어휘 수가 그 단서다.
//
// 클래스는 새로 낸다(스펙 V-25). v1 의 .resume 계열이 tokens.css 에 소비처 없이 남아 있었고
// 이 슬라이스에서 지웠다 — 남긴 채 새로 지으면 어느 쪽이 진짜인지 다음 사람이 모른다.

import type { ResumeCard as ResumeCardData } from "@vock/shared";
import { useTr } from "../../i18n/locale.js";

export interface ResumeCardProps {
  card: ResumeCardData;
  onOpen(sessionId: string): void;
}

export function ResumeCard({ card, onOpen }: ResumeCardProps) {
  const tr = useTr();
  const s = card.session;

  // 메타는 세 갈래다(V-23). 담기 0개는 FR-702 때문에 실제로 도달하는 값이라
  // "0개 담음"을 그대로 보이면 재인 단서가 아니라 실패 통보로 읽힌다.
  const meta = s.generating
    ? tr("resume_meta_progress")
    : card.kept_count > 0
      ? tr("resume_meta_kept", { n: card.kept_count })
      : tr("resume_meta_none");

  return (
    <button className={s.generating ? "rcard inprog" : "rcard"} onClick={() => onOpen(s.session_id)}>
      <span className="rcardText">
        <span className="rcardEy">{s.generating ? tr("resume_in_progress") : tr("resume_eyebrow")}</span>
        {/* 분야는 문장에 섞지 않고 맨 라벨로만 쓴다(V-22) — 받침 조사 판정 유틸이 리포에 없다. */}
        <b>{s.area ?? s.topic}</b>
        <span className="rcardMeta">{meta}</span>
      </span>
      <span className="rcardGo">{tr("resume_go")}</span>
    </button>
  );
}
