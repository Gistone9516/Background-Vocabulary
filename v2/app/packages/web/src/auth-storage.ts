// 웹 셸의 토큰 저장소 구현. ui-shared는 저장 방식을 모르고 이 포트만 받는다.
// 데스크톱(C4)은 같은 포트를 보안 저장소로 구현해 넣는다.
//
// 알려진 한계: refresh 토큰이 localStorage에 있어 XSS에 노출된다. 웹 SPA에 서버 세션
// 쿠키가 없어 현실적 대안이 좁다. S5 본편에서 NFR과 대조해 재검토한다(스펙 S5a §6).

import type { StoredTokens, TokenStore } from "@vock/ui-shared";

const KEY = "vock:tokens";

export function localTokenStore(): TokenStore {
  return {
    read(): StoredTokens | null {
      try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        const p = JSON.parse(raw) as Partial<StoredTokens>;
        return typeof p.access === "string" && typeof p.refresh === "string"
          ? { access: p.access, refresh: p.refresh }
          : null;
      } catch {
        // 저장소가 막혔거나 값이 깨진 경우. 로그인 안 된 것으로 본다.
        return null;
      }
    },
    write(t: StoredTokens): void {
      try {
        localStorage.setItem(KEY, JSON.stringify(t));
      } catch {
        /* 사생활 보호 모드 등에서 막힐 수 있다. 이번 세션만 유지된다 */
      }
    },
    clear(): void {
      try {
        localStorage.removeItem(KEY);
      } catch {
        /* 무시 */
      }
    },
  };
}
