// 재진입 카드 조회(C5-S3 FR-707).
//
// 의존은 셋뿐이다(V-17): 진입 화면에 있는가 · 어느 프로젝트 스코프인가 · 로그인했는가.
// 이 셋을 안 적으면 기존 목록 훅의 관례("의존값이 바뀔 때만 조회")를 그대로 물려받아
// 카드가 앱 실행 중 한 번만 로드되는 정적 스냅샷이 된다. 추론이 아니라 v1 이 같은 자리에서
// 실제로 겪은 사고다 — 홈으로 돌아와도 다시 부르지 않아 "이어서 보기" 카드가 사라졌고,
// 복귀 시 명시적으로 재호출하는 것으로 고쳤다.
//
// 실패는 삼키고 카드를 비운다(V-20). 오프라인 캐시가 이 경로를 감싸지 않으므로 네트워크가
// 끊기면 여기로 온다 — 개수 없는 카드는 재인 단서가 약해 존재 이유가 흐려진다.

import { useEffect, useState } from "react";
import type { ResumeCard } from "@vock/shared";
import type { ApiPort } from "../api/index.js";

export interface UseResumeCardOptions {
  api: ApiPort;
  enabled: boolean;
  atEntry: boolean;
  projectId: string | null;
}

export function useResumeCard({ api, enabled, atEntry, projectId }: UseResumeCardOptions): ResumeCard | null {
  const [card, setCard] = useState<ResumeCard | null>(null);

  useEffect(() => {
    if (!enabled || !atEntry) {
      setCard(null);
      return;
    }
    // 스코프 전환 중 이전 스코프의 카드가 클릭 가능한 채로 남지 않게 먼저 비운다.
    setCard(null);
    let alive = true;
    api
      .recentCard(projectId)
      .then((c) => {
        if (alive) setCard(c);
      })
      .catch(() => {
        if (alive) setCard(null);
      });
    return () => {
      alive = false;
    };
  }, [api, enabled, atEntry, projectId]);

  return card;
}
