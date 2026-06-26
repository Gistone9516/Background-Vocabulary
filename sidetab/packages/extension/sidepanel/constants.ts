// 사이드패널 공용 상수. App.tsx와 mock.ts가 함께 쓴다(HIGHRISK 중복 단일화).
import type { OutputLocale } from "@sidetab/shared";

// 좁히기 종료 최소 턴.
export const MIN_Q = 3;

// 아키네이터 로딩 문구 키. 추론이 길어질 때 4초 간격으로 다음 문구로 바꿔 진행감을 준다(마지막 문구에서 정지).
export const THINK_KEYS = ["thinking", "thinking2", "thinking3", "thinking4"] as const;

// 고위험 도메인(의료·법률 개인판단 등) 진입 차단용 정규식. 클라 1차 가드(서버 domain_risk와 이중).
export const HIGHRISK = /(의료|진단|병원|처방|법률|소송|변호|판결|고소|세무신고|증상|치료)/;

// 날짜 표기 로케일 태그.
export const LOCALE_TAG: Record<OutputLocale, string> = { ko: "ko-KR", en: "en-US", ja: "ja-JP", zh: "zh-CN" };

// 튜토리얼 3스텝 은하계 분야 맵의 노드 좌표(중심 코어 기준으로 흩뿌림).
export const GALAXY_POS = [
  { left: "50%", top: "13%" }, { left: "76%", top: "20%" }, { left: "89%", top: "46%" }, { left: "78%", top: "74%" },
  { left: "52%", top: "88%" }, { left: "24%", top: "80%" }, { left: "11%", top: "54%" }, { left: "21%", top: "23%" },
  { left: "63%", top: "39%" }, { left: "37%", top: "37%" }, { left: "70%", top: "61%" }, { left: "32%", top: "63%" },
];
