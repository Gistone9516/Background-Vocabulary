// 운영 한도 타입. 코드 기본값(DEFAULT_LIMITS)을 두되 어댑터가 env로 전부 덮어쓸 수 있다.
// 서버(어댑터)가 env에서 읽어 createPipeline에 주입하고, 클라이언트 관련 값은 /config로 전달한다.

// 튜닝 가능한 운영 한도.
export interface Limits {
  termCount: { free: number; paid: number }; // 추천 어휘 개수(티어별)
  maxTokens: {
    classify: number;
    next: number;
    summarize: number;
    recommend: { free: number; paid: number };
    detail: { free: number; paid: number };
  };
  freeWeeklyLimit: number; // 무료 주간 추천 한도
  globalDailyCap: number; // 전역 일일 캡(빌드 폭주 방지)
  narrowMax: { free: number; paid: number }; // 좁히기 최대 턴
  detailLimitFree: number; // 무료 세션당 상세 열람 횟수
  maxTotal: { free: number; paid: number }; // 한 탐색에서 누적 가능한 어휘 카드 총 상한
  groupGen: { free: number; paid: number }; // 그룹별 추가 생성 1회당 개수
  // 보안 하드닝. 인증 없는 anti-abuse 한도.
  maxInputChars: number; // 단일 사용자 입력 텍스트 필드 길이 상한(토큰 비용·인젝션 방어)
  ratePerMin: number; // IP당 분당 요청 상한
  ratePerDay: number; // IP당 일일 요청 상한
  // 붙여넣은 문서(context_object) 전용 큰 상한. 일반 입력(maxInputChars)보다 길게 허용한다(pro 파일 첨부).
  maxContextChars: number;
}

export const DEFAULT_LIMITS: Limits = {
  termCount: { free: 4, paid: 8 },
  maxTokens: {
    classify: 900,
    next: 800,
    summarize: 1800,
    recommend: { free: 1400, paid: 2600 },
    detail: { free: 900, paid: 1300 },
  },
  freeWeeklyLimit: 7,
  globalDailyCap: 300,
  narrowMax: { free: 3, paid: 8 },
  detailLimitFree: 3,
  maxTotal: { free: 8, paid: 32 },
  groupGen: { free: 2, paid: 4 },
  maxInputChars: 4000,
  ratePerMin: 20,
  ratePerDay: 200,
  maxContextChars: 12000,
};

// 클라이언트가 게이팅에 쓰는 한도 부분집합. /config 응답 형태.
export interface ClientLimits {
  narrowMax: { free: number; paid: number };
  detailLimitFree: number;
  freeWeeklyLimit: number;
  maxTotal: { free: number; paid: number }; // 어휘 카드 누적 상한(티어별)
  groupGen: { free: number; paid: number }; // 그룹별 추가 생성 개수(티어별)
  maxContextChars: number; // 첨부 문서 텍스트를 클라가 이 길이로 잘라 보낸다.
}
