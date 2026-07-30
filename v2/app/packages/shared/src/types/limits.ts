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
  // 좁히기 최소 턴. 이 턴수를 채우기 전에는 백엔드가 충분하다고 판정해도 종료하지 않는다.
  // v1에서는 클라이언트 상수였다. 클라가 종료 시점을 쥐는 것은 결합도 위반이라 서버 설정으로 옮겼다.
  narrowMin: number;
  detailLimitFree: number; // 무료 세션당 상세 열람 횟수
  maxTotal: { free: number; paid: number }; // 한 탐색에서 누적 가능한 어휘 카드 총 상한
  groupGen: { free: number; paid: number }; // 그룹별 추가 생성 1회당 개수
  // 보안 하드닝. 인증 없는 anti-abuse 한도.
  maxInputChars: number; // 단일 사용자 입력 텍스트 필드 길이 상한(토큰 비용·인젝션 방어)
  ratePerMin: number; // IP당 분당 요청 상한
  ratePerDay: number; // IP당 일일 요청 상한
  // 붙여넣은 문서(context_object) 전용 큰 상한. 일반 입력(maxInputChars)보다 길게 허용한다(pro 파일 첨부).
  maxContextChars: number;
  // 파일 첨부(context_object) 티어 게이트(C4 S4 DS4-3). true = pro 전용(v1 참고 기본값).
  // **정본은 C5 결제 재설계다(TR-06 "참고 기본값")** — 그래서 코드에 박지 않고 env로 덮는 이 자리에 둔다.
  // 서버 게이팅과 /config(클라 잠금 표시)가 같은 값을 읽어 판정과 화면이 갈라질 수 없다.
  attachRequiresPro: boolean;
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
  narrowMin: 3,
  detailLimitFree: 3,
  maxTotal: { free: 8, paid: 32 },
  groupGen: { free: 2, paid: 4 },
  maxInputChars: 4000,
  ratePerMin: 20,
  ratePerDay: 200,
  maxContextChars: 12000,
  attachRequiresPro: true,
};

// 서버가 클라이언트에게 알려 주는 설정. /config 응답 형태.
// 대부분은 게이팅에 쓰는 한도 부분집합이고, 한도가 아닌 값은 아래 주석으로 구분한다.
export interface ClientLimits {
  // 한도가 아님. 구글 OAuth 클라이언트 식별자(공개값이라 클라에 실어도 된다).
  // 없으면 클라가 로그인 UI를 아예 띄우지 않는다. 실 콘솔 등록 전에는 없는 것이 정상이고,
  // 없는 채로 버튼을 띄우면 눌러서 깨진다(스펙 S5a A-2).
  googleClientId?: string;
  narrowMax: { free: number; paid: number };
  narrowMin: number; // 좁히기 최소 턴. 클라가 종료 판정에 쓴다.
  detailLimitFree: number;
  freeWeeklyLimit: number;
  maxTotal: { free: number; paid: number }; // 어휘 카드 누적 상한(티어별)
  groupGen: { free: number; paid: number }; // 그룹별 추가 생성 개수(티어별)
  maxContextChars: number; // 첨부 문서 텍스트를 클라가 이 길이로 잘라 보낸다.
  attachRequiresPro: boolean; // 첨부 잠금 표시용(C4 S4). 판정은 서버 게이팅이 같은 값으로 한다.
}
