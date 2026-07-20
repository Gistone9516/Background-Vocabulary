// 게이팅 카운터 포트. v1의 UpstashCounter·UsageCounter·GlobalDailyCap을 하나로 통합
// (전부 INCR+최초 EXPIRE / GET 패턴, 키 스킴만 다름). 구현 = Upstash(providers, C2.4) / 인메모리(local).
// 장애 시 fail-open은 호출부(게이팅 미들웨어)에서 처리한다(NFR-404).

export interface CounterStore {
  // key를 1 올리고 올린 값을 반환한다. 최초(=1)일 때만 ttlSec 만료를 건다.
  hit(key: string, ttlSec: number): Promise<number>;
  // 올리지 않고 현재 값만 읽는다(키 없으면 0). 선-확인 후 차감(재시도마다 카운트 증가 방지)에 쓴다.
  get(key: string): Promise<number>;
}
