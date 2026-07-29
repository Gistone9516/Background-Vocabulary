// 화면이 서버를 부르는 유일한 통로. 구현은 주입받는다.
// S2 범위는 classify와 next 둘뿐이다. 아직 소비처가 없는 엔드포인트는 여기 올리지 않는다.
// 실패는 예외로 던지되 항상 ApiError 형태여야 한다(errors.ts의 isApiError로 판별 가능).

import type {
  ClientLimits,
  PreviewIn,
  PreviewOut,
  PrimerDoc,
  Prompt1In,
  Prompt4In,
  Prompt1Out,
  Prompt2In,
  Prompt2Out,
  Prompt5In,
  Prompt5Out,
  RecommendInput,
  StreamEvent,
  Tier,
} from "@vock/shared";

// 로그인 응답. 서버가 주는 필드명을 그대로 쓴다.
// SoT §3-2 표는 {access, refresh, user}로 축약돼 있지만 실제 응답은 아래다(auth-routes.ts:22).
// 표만 보고 짜면 토큰을 못 읽고 조용히 실패한다.
export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: { email: string; tier: Tier };
}

// 인증은 ApiPort와 분리한다. 파이프라인 호출과 수명이 다르고 로그인 없이도 앱이 돌아야 한다.
export interface AuthPort {
  login(args: { code: string; codeVerifier: string; redirectUri: string }): Promise<AuthSession>;
  refresh(refreshToken: string): Promise<AuthSession | null>; // null이면 재로그인 필요
  logout(refreshToken: string): Promise<void>;
}

export interface ApiPort {
  config(signal?: AbortSignal): Promise<ClientLimits>;
  classify(input: Prompt1In, signal?: AbortSignal): Promise<Prompt1Out>;
  next(input: Prompt2In, signal?: AbortSignal): Promise<Prompt2Out>;
  preview(input: PreviewIn, signal?: AbortSignal): Promise<PreviewOut>;
  detail(input: Prompt5In, signal?: AbortSignal): Promise<Prompt5Out>;
  // pro 전용. 구조만 돌려주고 붙여넣을 본문은 클라가 조립한다.
  summarize(input: Prompt4In, signal?: AbortSignal): Promise<PrimerDoc>;
  // 서버가 흘리는 이벤트를 순서 그대로 넘긴다. 취소는 signal로 전파한다.
  recommendStream(input: RecommendInput, signal: AbortSignal): AsyncIterable<StreamEvent>;
}
