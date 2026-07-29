// 화면이 서버를 부르는 유일한 통로. 구현은 주입받는다.
// S2 범위는 classify와 next 둘뿐이다. 아직 소비처가 없는 엔드포인트는 여기 올리지 않는다.
// 실패는 예외로 던지되 항상 ApiError 형태여야 한다(errors.ts의 isApiError로 판별 가능).

import type {
  ClientLimits,
  PreviewIn,
  PreviewOut,
  Prompt1In,
  Prompt1Out,
  Prompt2In,
  Prompt2Out,
  Prompt5In,
  Prompt5Out,
  RecommendInput,
  StreamEvent,
} from "@vock/shared";

export interface ApiPort {
  config(signal?: AbortSignal): Promise<ClientLimits>;
  classify(input: Prompt1In, signal?: AbortSignal): Promise<Prompt1Out>;
  next(input: Prompt2In, signal?: AbortSignal): Promise<Prompt2Out>;
  preview(input: PreviewIn, signal?: AbortSignal): Promise<PreviewOut>;
  detail(input: Prompt5In, signal?: AbortSignal): Promise<Prompt5Out>;
  // 서버가 흘리는 이벤트를 순서 그대로 넘긴다. 취소는 signal로 전파한다.
  recommendStream(input: RecommendInput, signal: AbortSignal): AsyncIterable<StreamEvent>;
}
