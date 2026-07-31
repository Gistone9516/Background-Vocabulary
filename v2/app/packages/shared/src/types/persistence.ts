// 영속 도메인 타입(서버 정본). 정본 = 인터페이스계약-v2 §2-3. 목록·페이지 타입도 함께 둔다.
// MindMap(GET /map)·RefinePrimer(FR-607)은 뒤 슬라이스에서 추가한다.

import type { Choice, Prompt1Out, Prompt5Out, Term } from "./pipeline-io.js";
import type { DomainRisk, JobType, GapType, OutputLocale } from "./enums.js";

// 구조화 프라이머(FR-604). 서버 정본은 SessionRec.primer.
export interface PrimerDoc {
  locale: OutputLocale; // FR-952 — 생성 텍스트 로케일
  area: string;
  task_intent: string;
  user_condition?: string;
  context_note?: string;
  // 담은 어휘 전체. 조회/저장으로 가르지 않는다(E-3의 이유와 같다 — 서버는 가를 근거가 없고,
  // 클라는 assets·details로 이미 안다. 두 곳이 가르면 같은 구분에 출처가 둘이 된다).
  terms: string[];
  refined?: { audience?: string; goal_detail?: string; constraints?: string[] }; // FR-607 산출
}

// 좁히기 질문 한 개. 화면과 저장이 같은 형태를 쓴다.
export interface Question {
  question: string;
  choices: Choice[];
}

// 좁히기 한 턴의 답. 여러 개를 한 번에 고를 수 있으므로 턴이 단위이고 라벨은 그 안의 배열이다.
// "어려워요"는 답이 아니라 난이도 신호라 턴으로 세지 않는다(v1 최종 교정).
// discarded = 되돌리기로 버린 턴. 답으로는 죽었지만 예산은 이미 썼다.
// 예산 카운터를 따로 두지 않기 위해 여기 남긴다 — 두 값이 한 배열에서 각각 파생된다.
// 히스토리는 picks만 모으고(버린 답은 LLM에 보내지 않는다), 예산은 picks+discarded를 센다.
export type AnswerTurn =
  | { kind: "picks"; labels: string[] }
  | { kind: "tooHard" }
  | { kind: "discarded" };

// 좁히기 진행 스냅샷(매 턴 저장, FR-701).
// 재개에 필요한 것을 전부 담는다(S5 S-20). SessionRec의 스칼라 컬럼만으로는 좁히기 맥락을
// 복원할 수 없다 — search_locale이 컬럼에 없어 재개 후 추천이 다른 로케일로 나가고,
// 첫 질문이 없어 되돌리기 기준점이 사라지고, usedUndo가 없으면 재개마다 되돌리기가 새로 생긴다.
export interface NarrowSnap {
  // 분류 결과 정본. 컬럼(area·job_type·domain_risk)은 여기서 파생한 목록용 색인이며,
  // 재개할 때 컬럼을 되읽지 않는다(S-21). 첫 질문도 여기 question/choices다.
  classify: Prompt1Out;
  // 지금 떠 있는 질문. null이면 좁히기는 끝났고 난이도 선택 앞이다.
  // 이 한 필드가 재개 지점을 정한다 — 따로 단계 플래그를 두면 질문 유무와 어긋날 수 있다.
  question: Question | null;
  // 상태 기계가 쓰는 형태 그대로다(S-23). 저장용 형태로 바꾸지 않는다 —
  // 라벨당 한 행으로 펴면 한 턴에 여러 개를 고른 경우가 여러 턴으로 세어져
  // 답변 수와 턴 수가 어긋난다. 종료 판정은 턴을 센다.
  answers: AnswerTurn[];
  // 좁히기 진행 플래그. 답변에서 파생되지 않는 것만 담는다.
  simplify: boolean; // "어려워요"가 눌린 뒤인가
  usedUndo: boolean; // 되돌리기 1회를 썼는가
  confidence: number; // 직전 /next의 확신도. 종료 판정이 읽는다
  // 연결 턴에서 고른 방향. 카드 상세가 connection_hint로 쓴다(S3b).
  // 재개해도 남아야 하므로 여기 담는다 — 좁히기가 끝난 뒤에야 쓰이는 값이다.
  connection?: string;
  // 남은 턴은 저장하지 않는다. answers에서 "어려워요"를 뺀 수와 현재 티어 상한으로 계산한다.
  // 저장하면 답변 수와 예산이 각각 움직여 어긋난다. v1이 정확히 그 형태로 버그를 냈다.
}

// 탐색 세션(진행 중 또는 완료).
export interface SessionRec {
  session_id: string;
  user_id: string;
  topic: string;
  area: string | null;
  domain_risk: DomainRisk;
  job_type: JobType[];
  gap_type: GapType[] | null;
  user_condition: string | null;
  context_object: string | null;
  narrow: NarrowSnap | null; // null이면 생성 완료(불변식: narrow 존재 ⟺ 생성 미완)
  generated: Term[] | null; // 생성된 리스트 전체(담기 0개여도 보존, FR-702)
  primer: PrimerDoc | null; // 프라이머 서버 정본. /summarize·/refine-primer가 갱신
  project_id: string | null;
  pinned: boolean;
  deleted_at: number | null; // 소프트 삭제. 목록 기본 제외, 유예 내 restore 가능
  created_at: number;
  updated_at: number;
}

// 담은 어휘 = 어휘 자산(FR-601).
export interface AssetTerm {
  asset_id: string;
  user_id: string;
  session_id: string;
  term: Term; // 담은 시점의 카드 전체
  term_norm: string; // 정규화 키(중복 담기 방지·맵 노드 키)
  domain_tags: string[]; // 마인드맵 크로스 도메인 엣지 재료(FR-312)
  project_id: string | null;
  created_at: number;
}

// 펼친 상세 본문(FR-401 "한 번 연 내용은 캐시"). 행의 존재 자체가 "조회했다"는 기록이다 —
// 조회 플래그를 따로 두면 한 사실에 출처가 둘이 된다(E-2).
export interface DetailRec {
  user_id: string; // 캐시는 사용자 간 공유하지 않는다. whymine이 개인 맥락이라 남의 것을 주면 조용한 오답이 된다(E-4)
  session_id: string; // 어느 세션에서 펼쳤는가. 패널의 세션 스코프가 읽는다
  term_norm: string; // 표시·목록용. 캐시 판정은 이것으로 하지 않는다(E-3)
  input_key: string; // Prompt5In 전 필드 + 프롬프트 버전. 캐시 판정은 이것만 본다
  body: Prompt5Out;
  created_at: number;
}

export interface Project {
  project_id: string;
  user_id: string;
  name: string;
  created_at: number;
}

// 목록 페이지(커서 페이지네이션 — Data API 1MB 상한 대응).
export interface Page<T> {
  items: T[];
  nextCursor: string | null; // 불투명 커서. null이면 마지막 페이지.
}

// 세션 목록 요약(대형 JSONB narrow/generated/primer 제외 — 단건 조회로만).
export interface SessionSummary {
  session_id: string;
  topic: string;
  area: string | null;
  domain_risk: DomainRisk;
  project_id: string | null;
  pinned: boolean;
  generating: boolean; // narrow != null (생성 미완)
  created_at: number;
  updated_at: number;
}

// 자산 목록 요약(term 대형 JSONB 대신 표시 필드만).
export interface AssetSummary {
  asset_id: string;
  session_id: string;
  term_norm: string;
  term_name: string;
  one_line: string;
  kind: string;
  domain_tags: string[];
  project_id: string | null;
  created_at: number;
}

export interface ListSessionsQuery {
  userId: string;
  projectId?: string | null;
  q?: string; // topic ILIKE 필터
  pinned?: boolean;
  limit?: number;
  cursor?: string | null;
}
