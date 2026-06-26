// 사이드패널 상태·화면 타입. App.tsx의 reducer와 화면 컴포넌트가 공유한다.
import type { Prompt1Out, Choice, Term, Prompt5Out, ClientLimits, OutputLocale } from "@sidetab/shared";
import type { SessionRec } from "./history.js";

export type Screen = "entry" | "narrow" | "terms" | "kept" | "paywall" | "refusal";

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
  terms: UITerm[]; visibleCount: number; openId: string | null; opening: string | null;
  query: string; groupView: boolean; detailCount: number;
  moreLoading: boolean; moreLoaded: boolean; streaming: boolean; groupGenLoading: string; refining: boolean;
  ctxInput: string; copied: boolean; copyFailed: boolean; shareNote: boolean;
  aiSummary: string; aiSummaryLoading: boolean;
  plan: "flash" | "pro"; remaining: number; prevScreen: Screen; limitHit: boolean;
  errorMsg: string;
  sessionId: string; history: SessionRec[]; histView: boolean;
  limits: ClientLimits; locale: OutputLocale;
}

export type Action =
  | { type: "merge"; patch: Partial<State> }
  | { type: "addTerm"; term: UITerm }
  | { type: "updateTerm"; id: string; patch: Partial<UITerm> }
  | { type: "reset" };
