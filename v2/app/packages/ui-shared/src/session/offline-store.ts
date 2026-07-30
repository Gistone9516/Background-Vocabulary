// 오프라인 캐시 저장소 포트(FR-902, C4 S3). 구현은 플랫폼이 갖는다 —
// 데스크톱 = tauri plugin-store(adapters/tauri), 웹 = 아직 null(능력 모델. IndexedDB는 별도 결정).
//
// 여기 저장되는 것은 **서버 응답의 사본**뿐이다(계약 §3-3 "정본=서버, 클라는 read-through 캐시").
// SessionRec 형태에 캐시 메타를 섞지 않는다(DS3-4) — savedAt은 캐시 파일의 것이다.

import type { SessionRec, SessionSummary } from "@vock/shared";

export interface CachedList {
  savedAt: number; // epoch ms. "언제 기준의 목록인가"를 고지에 쓸 수 있게 남긴다
  items: SessionSummary[];
}

export interface OfflineStore {
  readList(): Promise<CachedList | null>;
  writeList(items: SessionSummary[]): Promise<void>;
  readSession(id: string): Promise<SessionRec | null>;
  writeSession(rec: SessionRec): Promise<void>;
  removeSession(id: string): Promise<void>;
  // 로그아웃 경로에서 부른다(DS3-5). 같은 기기의 다음 사용자에게 남의 목록이 보이면
  // 소유권 규칙(서버 PUT 409)의 클라이언트 판 위반이다.
  clear(): Promise<void>;
}
