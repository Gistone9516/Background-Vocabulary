// 티어별 한도 선택. /config는 free와 paid를 함께 내려보내고, 어느 쪽을 쓸지는 여기서만 정한다.
// 화면마다 .free를 직접 읽으면 유료 사용자가 무료 한도를 받는 일이 조용히 생긴다(실측).

import type { ClientLimits, Tier } from "@vock/shared";

export interface TierLimits {
  narrowMin: number;
  narrowMax: number;
  maxTotal: number;
}

// /config를 아직 못 받았을 때 쓰는 값. 서버가 정본이고 이건 첫 화면이 멈추지 않게 하는 임시값이다.
export const FALLBACK_LIMITS: TierLimits = { narrowMin: 3, narrowMax: 3, maxTotal: 8 };

export function limitsFor(limits: ClientLimits | null, tier: Tier): TierLimits {
  if (!limits) return FALLBACK_LIMITS;
  return {
    narrowMin: limits.narrowMin,
    narrowMax: limits.narrowMax[tier],
    maxTotal: limits.maxTotal[tier],
  };
}
