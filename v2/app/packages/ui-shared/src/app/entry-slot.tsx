// 진입 화면 트랙에 무엇을 넣을지(C5-S3). 여정 배선(journey.tsx)과 다른 책임이라 파일을 나눈다 —
// 여정은 어느 화면인지를 정하고, 여기는 그 화면의 슬롯에 들어갈 내용을 정한다.
// 사이드바가 sidebar-slots.tsx 로 갈라진 것과 같은 모양이다.

import type { ReactNode } from "react";
import type { ApiPort } from "../api/index.js";
import { EntryTracks } from "../screens/entry/tracks.js";
import { ResumeCard } from "../screens/entry/ResumeCard.js";
import { useResumeCard } from "../session/useResumeCard.js";

export interface EntryTracksSlotOptions {
  api: ApiPort;
  signedIn: boolean;
  atEntry: boolean;
  projectId: string | null;
  // 세션 목록의 첫 항목. 카드가 이것과 다르면 띄우지 않는다(V-15).
  firstListed: string | null;
  onOpen(sessionId: string): void;
}

export function useEntryTracks(o: EntryTracksSlotOptions): ReactNode {
  const card = useResumeCard({
    api: o.api,
    enabled: o.signedIn,
    atEntry: o.atEntry,
    projectId: o.projectId,
  });

  // 소속은 목록이 정본이다(V-15). 어긋나면 틀린 카드를 보이느니 안 보인다 —
  // 다음 새로고침에서 자연히 맞는다.
  const show = card && o.firstListed && card.session.session_id === o.firstListed ? card : null;

  return (
    <EntryTracks
      card={show ? <ResumeCard card={show} onOpen={o.onOpen} /> : null}
      // 가변 슬롯은 이 슬라이스에서 자리만 만든다(스펙 §9).
      flex={null}
      // 마인드맵은 S4 가 꽂는다(V-14). 칸은 비어도 자리를 지킨다(V-24).
      map={null}
    />
  );
}
