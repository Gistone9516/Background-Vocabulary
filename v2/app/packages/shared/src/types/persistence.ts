// 영속 도메인 타입(서버 정본). 정본 = 인터페이스계약-v2 §2-3. 목록·페이지 타입도 함께 둔다.
// MindMap(GET /map)·RefinePrimer(FR-607)은 C5에서 추가한다.

import type { Choice, Term } from "./pipeline-io.js";
import type { DomainRisk, JobType, GapType, Tag, OutputLocale } from "./enums.js";

// 구조화 프라이머(FR-604). 서버 정본은 SessionRec.primer.
export interface PrimerDoc {
  locale: OutputLocale; // FR-952 — 생성 텍스트 로케일
  area: string;
  task_intent: string;
  user_condition?: string;
  context_note?: string;
  known_terms: string[];
  unknown_terms: string[];
  refined?: { audience?: string; goal_detail?: string; constraints?: string[] }; // FR-607 산출
}

// 좁히기 진행 스냅샷(매 턴 저장, FR-701).
export interface NarrowSnap {
  question: string;
  choices: Choice[];
  answers: { label: string; action: "선택" | "더깊이제외" | "어려워요"; at?: number }[]; // at = 클릭 시각(NFR-503 계측 자리)
  turns_left: number; // 재개 시 (현재 plan, answers)로 재계산이 정본(v1 교훈)
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

// 지식 상태(FR-502). unconfirmed는 클라 전용이라 없음.
export interface KnowledgeState {
  user_id: string;
  term_norm: string;
  tag: Tag;
  updated_at: number;
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
