// 사이드패널 상태·화면 타입. App.tsx의 reducer와 화면 컴포넌트가 공유한다.
import type { Prompt1Out, Choice, Term, Prompt5Out, PreviewOut, RelateOut, ClientLimits, OutputLocale } from "@sidetab/shared";
import type { SessionRec, Project } from "./history.js";

export type Screen = "entry" | "narrow" | "relate" | "difficulty" | "terms" | "kept" | "paywall" | "refusal" | "sessions" | "projects";

// 어휘 난이도. 아키네이터 종료 직전 사용자가 고르며, 리스트 전체가 이 깊이로 생성된다.
export type Difficulty = "기초" | "중급" | "심화";

export interface UITerm extends Term {
  id: string;
  kept: boolean;
  _new: boolean;
  detail?: Prompt5Out;
  detailLoading?: boolean;
}

export interface Q { question: string; choices: Choice[] }

export interface State {
  screen: Screen;
  input: string; cond: string; showCond: boolean; inputErr: boolean;
  attachedFile: { name: string; text: string } | null; dragging: boolean; attachNote: string;
  chipSeed: number; tutorialOpen: boolean;
  classifyOut: Prompt1Out | null;
  questions: Q[]; answers: string[][]; sel: string[];
  confidence: number; pending: boolean;
  customText: string; customOpen: boolean; // 아키네이터 직접 입력
  usedUndo: boolean; tooHard: boolean; simplify: boolean; // 되돌리기 1회·이번턴 "어려워요" 선택·세션 난이도 하향
  unchosen: string[][]; // 좁히기 매 턴 고르지 않은 가지(다른 갈래도 보기)
  difficulty?: Difficulty; // 고른 어휘 난이도(기초/중급/심화)
  previews?: PreviewOut | null; // 난이도 화면의 깊이별 대표 어휘 예시(LLM 생성). null=미생성/폴백.
  previewLoading?: boolean; // 난이도 예시 생성 중(스켈레톤 표시)
  relateOut?: RelateOut | null; // 연결 턴(프로젝트 kept 어휘 연결 질문). null=없음/스킵.
  relateLoading?: boolean; // 연결 판정 LLM 호출 중
  relateCond?: string; // 연결 턴에서 사용자가 고른 방향. recommend의 user_condition에 합쳐진다(빈값=프라이밍 없음).
  turnsLeft: number; // 아키네이터 좁히기 턴 공유 예산(세션 간 영속, 생성 완료 시 재충전)
  terms: UITerm[]; visibleCount: number; openId: string | null; opening: string | null;
  query: string; groupView: boolean; detailCount: number;
  moreLoading: boolean; moreLoaded: boolean; streaming: boolean; groupGenLoading: string; refining: boolean;
  ctxInput: string; copied: boolean; copyFailed: boolean; shareNote: boolean;
  aiSummary: string; aiSummaryLoading: boolean;
  plan: "flash" | "pro"; remaining: number; prevScreen: Screen; limitHit: boolean;
  proNotice?: string; // 하단 고지 패널 사유(첨부·더보기·상세·재탐색·정리·상한·주간소진). 페이월로 강제 이동하지 않고 그 자리서 알린다.
  confirmHome?: boolean; // 진행 중 탐색을 두고 홈으로 갈 때 확인 노출
  pendingDel?: SessionRec | null; // 방금 지운 이전 탐색(실행취소 대기)
  settingsOpen?: boolean; // 설정 시트 열림
  reviewOn: boolean; // 복습 알림 설정(기본 켜짐, localStorage 영속)
  reviewDismissed?: boolean; // 이번 진입에서 복습 배너를 닫음
  errorMsg: string;
  sessionId: string; history: SessionRec[]; histView: boolean;
  sessionsQuery?: string; // 세션 화면 검색어(topic·area 필터)
  projects: Project[]; activeProject?: string; // 프로젝트(폴더) 목록과 현재 스코프(undefined=전체)
  drawerOpen?: boolean; // 좌상단 버거로 여는 플로팅 선택 패널 열림
  resumedSession?: boolean; // 이전 탐색을 이어서 진행 중(narrow 복원). 좁히기 화면의 "이어서 진행 중" 안내 분기에 쓴다.
  limits: ClientLimits; locale: OutputLocale;
}

export type Action =
  | { type: "merge"; patch: Partial<State> }
  | { type: "addTerm"; term: UITerm }
  | { type: "updateTerm"; id: string; patch: Partial<UITerm> }
  | { type: "reset" };
