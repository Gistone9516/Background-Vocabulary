// 진입 화면 하단 트랙(C5-S3). 예시칩 아래에 오는 격자다.
//
// 자리는 `.hero` 안, `.heroGlow` 의 형제다(V-1). 셋 중 유일하게 성립하는 자리다 —
// `.heroGlow` 안에 넣으면 오로라의 bottom:0 이 컨테이너 바닥을 따라와 덮고,
// `.hero` 의 형제로 두면 `.hero{flex:1}` 이 남는 세로를 먼저 먹어 트랙이 화면 밖으로 밀린다.
//
// DOM 순서는 카드 → 가변 → 마인드맵 하나뿐이다(V-2). 두 벌을 렌더해 CSS 로 숨기지 않고
// JS 로 폭을 재지도 않는다 — 전자는 D-12 가, 후자는 EditSheet 선례가 막는다.
// 좁은 화면은 이 순서 그대로 쌓이고, 넓은 화면은 격자가 마인드맵을 왼쪽 아래로 올린다.
// 그래서 넓은 화면에서는 Tab 이 왼쪽 위에서 오른쪽으로 갔다가 왼쪽 아래로 돌아온다(V-5).
// 그 값을 V-6 이 상쇄한다 — 세 블록이 순서에 기대지 않고 각자 자기 라벨을 갖는다.

import type { ReactNode } from "react";

export interface EntryTracksProps {
  // 재진입 카드(FR-707). null = 보일 세션이 없다.
  card?: ReactNode | null;
  // 가변 슬롯. 무엇이 들어올지 이 컴포넌트는 모른다 — 스코프에 따라 journey 가 정한다(V-12·V-13).
  flex?: ReactNode | null;
  // 마인드맵 소형 창(FR-312). 이 슬라이스에서는 항상 null 이고 S4 가 채운다(V-14).
  map?: ReactNode | null;
}

export function EntryTracks({ card = null, flex = null, map = null }: EntryTracksProps) {
  // 셋 다 비면 그리지 않는다 — 신규 사용자에게 설명 없는 빈 격자가 보이는 것을 막는다.
  // 마인드맵만 비는 경우는 다르다: 칸을 그대로 남긴다(V-24). 카드가 왼쪽 열 전체로 넓어졌다가
  // S4 에서 반으로 줄어들면 같은 화면이 두 번 바뀐다.
  if (card === null && flex === null && map === null) return null;

  return (
    <div className="etracks">
      <div className="etCard">{card}</div>
      <div className="etFlex">{flex}</div>
      <div className="etMap">{map}</div>
    </div>
  );
}
